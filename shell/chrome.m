// Stremio+ window chrome. Loaded into Stremio.app two ways: patched Stremio carries a copy in Contents/MacOS with a
// weak load command (cli/patch.js), so every launch gets it; unpatched, the launcher injects it with
// DYLD_INSERT_LIBRARIES (Stremio's signature allows both). Hides the native title bar so the web UI runs to the top
// edge, moves the traffic lights into Stremio's nav bar, and lets the empty parts of that bar drag the window like a
// real title bar. In vanilla mode (stock UI, which has no room for the lights) it does nothing.
//
// The web UI (web/src/mods/macChrome.ts) sees `window.__stremioPlusChrome` and posts its geometry to the
// `stremioPlusChrome` message handler, in CSS px (== points), top-left origin:
//   { lights: { x, w, cy } | null,   // column to centre the traffic lights in, and the vertical centre
//     drag: [[x,y,w,h]...],           // window-drag areas (the nav bar)
//     holes: [[x,y,w,h]...],          // interactive elements inside them
//     hidden: bool }                  // hide the traffic lights (player with controls hidden)
//
// Now Playing: Stremio's shell already publishes a title, the show's logo and play/pause. The `stremioPlusMedia`
// handler (web/src/mods/nowPlaying.ts) adds artwork, subtitle, duration/position/rate; a swizzled
// -[MPNowPlayingInfoCenter setNowPlayingInfo:] merges them into whatever the shell sets. Skip and scrub commands go
// back to the web UI as `stremio-plus-media` window events ({ action: 'skip' | 'seek', value: seconds }).
//
// mpv: the shell's `mpv-set-prop` IPC only accepts a fixed set of property names (a Rust enum) and four commands, so
// player tweaks (deband, scaling, audio filters...) go through libmpv directly. `mpv_create` / `mpv_terminate_destroy`
// are interposed to hold the shell's handle (libmpv's property API is thread-safe). The `stremioPlusMpv` handler
// (web/src/mods/player/mpv.ts) takes { id, op, ... }:
//   get:   { names: [...] }                       -> { values: { name: string | null } }
//   set:   { props: { name: value | null } }      -> null restores the value we found before our first change;
//                                                    names outside kSettable are refused
//   af:    { presets: ['night' | 'dialogue'] }    -> our audio filters (kept apart from any the user has)
//   shaders: { preset: 'anime4k' | null }         -> a shader chain shipped in <root>/shaders/ (no other paths)
//   forget: { names: [...] }                      -> drop saved originals (the shell has set its own values since)
// and answers with a `stremio-plus-mpv` window event { id, ok, values?, errors? }.
//
// Dev only: when <root>/addon/data/dev/ exists, <root>/addon/data/dev/eval.js is run in the page (async function
// body) and the result written to eval.out.json, so tools can drive the real app (tools/dev-eval.js).
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <MediaPlayer/MediaPlayer.h>
#import <objc/runtime.h>
#import <dlfcn.h>
#import <pthread.h>

static const char kStateKey;

@interface SPChromeState : NSObject <WKScriptMessageHandler>
@property (weak) NSWindow *window;
@property (strong) NSArray<NSValue *> *drag;
@property (strong) NSArray<NSValue *> *holes;
@property (assign) BOOL hasLights;
@property (assign) CGFloat lightsX, lightsW, lightsCY;
@property (assign) BOOL hidden;
- (void)apply;
@end

@interface SPDragView : NSView
@property (weak) SPChromeState *state;
@end

static NSArray<NSValue *> *rects(id list) {
    NSMutableArray *out = [NSMutableArray array];
    if (![list isKindOfClass:[NSArray class]]) return out;
    for (id r in list) {
        if (![r isKindOfClass:[NSArray class]] || [r count] < 4) continue;
        [out addObject:[NSValue valueWithRect:NSMakeRect([r[0] doubleValue], [r[1] doubleValue],
                                                         [r[2] doubleValue], [r[3] doubleValue])]];
    }
    return out;
}

static BOOL inAny(NSArray<NSValue *> *list, NSPoint p) {
    for (NSValue *v in list) if (NSPointInRect(p, v.rectValue)) return YES;
    return NO;
}

@implementation SPDragView
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstMouse:(NSEvent *)e { return YES; }
- (NSView *)hitTest:(NSPoint)point {
    NSPoint p = [self convertPoint:point fromView:self.superview];
    SPChromeState *s = self.state;
    if (!s || (self.window.styleMask & NSWindowStyleMaskFullScreen)) return nil;
    if (inAny(s.drag, p) && !inAny(s.holes, p)) return self;
    return nil;
}
- (void)mouseDown:(NSEvent *)e {
    if (e.clickCount == 2) {
        NSString *action = [[NSUserDefaults standardUserDefaults] stringForKey:@"AppleActionOnDoubleClick"];
        if ([action isEqualToString:@"Minimize"]) [self.window performMiniaturize:nil];
        else if (![action isEqualToString:@"None"]) [self.window performZoom:nil];
        return;
    }
    [self.window performWindowDragWithEvent:e];
}
@end

@implementation SPChromeState
- (void)userContentController:(WKUserContentController *)ucc didReceiveScriptMessage:(WKScriptMessage *)msg {
    NSDictionary *b = [msg.body isKindOfClass:[NSDictionary class]] ? msg.body : nil;
    if (!b) return;
    NSDictionary *l = [b[@"lights"] isKindOfClass:[NSDictionary class]] ? b[@"lights"] : nil;
    self.hasLights = l != nil;
    if (l) {
        self.lightsX = [l[@"x"] doubleValue];
        self.lightsW = [l[@"w"] doubleValue];
        self.lightsCY = [l[@"cy"] doubleValue];
    }
    self.drag = rects(b[@"drag"]);
    self.holes = rects(b[@"holes"]);
    self.hidden = [b[@"hidden"] boolValue];
    [self apply];
}

// Electron's trafficLightPosition approach: size the titlebar container so the buttons sit at the wanted centre,
// then shift them horizontally. AppKit relays the titlebar out on resize, so this runs again after those.
- (void)apply {
    NSWindow *w = self.window;
    if (!w || (w.styleMask & NSWindowStyleMaskFullScreen)) return;
    NSButton *close = [w standardWindowButton:NSWindowCloseButton];
    NSButton *mini = [w standardWindowButton:NSWindowMiniaturizeButton];
    NSButton *zoom = [w standardWindowButton:NSWindowZoomButton];
    NSView *container = close.superview.superview;
    if (!close || !mini || !zoom || !container) return;

    BOOL hide = self.hidden;
    for (NSButton *b in @[close, mini, zoom]) {
        if (b.alphaValue != (hide ? 0 : 1)) {
            [NSAnimationContext runAnimationGroup:^(NSAnimationContext *ctx) {
                ctx.duration = 0.2;
                b.animator.alphaValue = hide ? 0 : 1;
            }];
        }
    }

    // The lights are drawn a touch larger than stock (Spotify-style); scale the titlebar view that holds them.
    NSView *bar = close.superview;
    const CGFloat scale = 1.18;
    CGFloat bh = close.frame.size.height;
    CGFloat spacing = mini.frame.origin.x - close.frame.origin.x;
    CGFloat cluster = (2 * spacing + zoom.frame.size.width) * scale;
    CGFloat cy = self.hasLights ? self.lightsCY : 20;
    // Same inset from the left edge as from the top, so the cluster sits square in the window corner (centring it
    // over the nav column left ~11pt at the side against ~23pt above, which read as misaligned).
    CGFloat left = self.hasLights ? MAX(self.lightsX, cy - bh * scale / 2) : 20;
    CGFloat height = MAX(bh * scale, round(cy * 2));
    NSRect f = container.frame;
    f.size.height = height;
    f.origin.y = w.frame.size.height - height;
    // Only as wide as the buttons need, so the container never sits over the web UI's own controls.
    f.size.width = MIN(w.frame.size.width, left + cluster + 12);
    if (!NSEqualRects(container.frame, f)) container.frame = f;
    NSRect bf = bar.frame;
    if (!NSEqualRects(bf, container.bounds)) bar.frame = bf = container.bounds;
    NSSize bounds = NSMakeSize(bf.size.width / scale, bf.size.height / scale);
    if (!NSEqualSizes(bar.bounds.size, bounds)) {
        [bar setBoundsSize:bounds];
        [bar setBoundsOrigin:NSZeroPoint];
    }
    CGFloat y = (bounds.height - bh) / 2;
    NSArray *buttons = @[close, mini, zoom];
    for (NSUInteger i = 0; i < 3; i++) {
        NSButton *b = buttons[i];
        NSPoint o = NSMakePoint(left / scale + i * spacing, y);
        if (!NSEqualPoints(b.frame.origin, o)) [b setFrameOrigin:o];
    }
    [bar setNeedsDisplay:YES];
}
@end

// ---- Now Playing -------------------------------------------------------------------------------------------------

@interface SPMedia : NSObject <WKScriptMessageHandler>
@property (weak) WKWebView *web;
@property (assign) BOOL active, canSeek, paused, live;
@property (copy) NSString *title, *subtitle, *artURL;
@property (strong) MPMediaItemArtwork *artwork;
@property (copy) NSString *loadedArtURL;
@property (assign) double duration, position, rate, skip;
+ (instancetype)shared;
- (NSDictionary *)merge:(NSDictionary *)info;
@end

static IMP sOrigSetInfo;
static void spSetNowPlayingInfo(id self, SEL _cmd, NSDictionary *info) {
    NSDictionary *merged = [[SPMedia shared] merge:info];
    ((void (*)(id, SEL, NSDictionary *))sOrigSetInfo)(self, _cmd, merged);
}

@implementation SPMedia {
    id _skipFwd, _skipBack, _scrub;
}
+ (instancetype)shared {
    static SPMedia *m;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ m = [SPMedia new]; });
    return m;
}

- (NSDictionary *)merge:(NSDictionary *)info {
    @synchronized (self) {
        // Player closed (or not open yet): nothing is playing, so leave Control Center empty rather than showing
        // a stale title the shell keeps around after the player unmounts.
        if (!self.active) return nil;
        NSMutableDictionary *d = info ? [info mutableCopy] : [NSMutableDictionary dictionary];
        if (self.title.length) d[MPMediaItemPropertyTitle] = self.title;
        if (self.subtitle.length) d[MPMediaItemPropertyArtist] = self.subtitle;
        else [d removeObjectForKey:MPMediaItemPropertyArtist];
        if (self.artwork) d[MPMediaItemPropertyArtwork] = self.artwork;
        d[MPNowPlayingInfoPropertyMediaType] = @(MPNowPlayingInfoMediaTypeVideo);
        d[MPNowPlayingInfoPropertyIsLiveStream] = @(self.live);
        d[MPNowPlayingInfoPropertyDefaultPlaybackRate] = @1.0;
        d[MPNowPlayingInfoPropertyPlaybackRate] = @(self.paused ? 0.0 : self.rate);
        if (self.canSeek && self.duration > 0) {
            d[MPMediaItemPropertyPlaybackDuration] = @(self.duration);
            d[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(self.position);
        } else {
            [d removeObjectsForKeys:@[MPMediaItemPropertyPlaybackDuration, MPNowPlayingInfoPropertyElapsedPlaybackTime]];
        }
        return d;
    }
}

- (void)send:(NSString *)action value:(double)value {
    WKWebView *web = self.web;
    if (!web) return;
    NSString *js = [NSString stringWithFormat:
        @"window.dispatchEvent(new CustomEvent('stremio-plus-media',{detail:{action:'%@',value:%f}}))", action, value];
    dispatch_async(dispatch_get_main_queue(), ^{ [web evaluateJavaScript:js completionHandler:nil]; });
}

- (void)updateCommands {
    MPRemoteCommandCenter *cc = [MPRemoteCommandCenter sharedCommandCenter];
    if (!_skipFwd) {
        __weak SPMedia *weakSelf = self;
        _skipFwd = [cc.skipForwardCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
            [weakSelf send:@"skip" value:((MPSkipIntervalCommandEvent *)e).interval];
            return MPRemoteCommandHandlerStatusSuccess;
        }];
        _skipBack = [cc.skipBackwardCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
            [weakSelf send:@"skip" value:-((MPSkipIntervalCommandEvent *)e).interval];
            return MPRemoteCommandHandlerStatusSuccess;
        }];
        _scrub = [cc.changePlaybackPositionCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
            [weakSelf send:@"seek" value:((MPChangePlaybackPositionCommandEvent *)e).positionTime];
            return MPRemoteCommandHandlerStatusSuccess;
        }];
    }
    BOOL on = self.active && self.canSeek;
    NSArray *intervals = @[@(self.skip > 0 ? self.skip : 10)];
    if (![cc.skipForwardCommand.preferredIntervals isEqual:intervals]) {
        cc.skipForwardCommand.preferredIntervals = intervals;
        cc.skipBackwardCommand.preferredIntervals = intervals;
    }
    cc.skipForwardCommand.enabled = on;
    cc.skipBackwardCommand.enabled = on;
    cc.changePlaybackPositionCommand.enabled = on;
}

- (void)loadArtwork {
    NSString *url = self.artURL;
    if ([url isEqual:self.loadedArtURL]) return;
    self.loadedArtURL = url;
    self.artwork = nil;
    NSURL *u = url.length ? [NSURL URLWithString:url] : nil;
    if (!u) return;
    [[[NSURLSession sharedSession] dataTaskWithURL:u completionHandler:^(NSData *data, NSURLResponse *r, NSError *err) {
        NSImage *img = data ? [[NSImage alloc] initWithData:data] : nil;
        if (!img) return;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (![self.loadedArtURL isEqual:url]) return;
            self.artwork = [[MPMediaItemArtwork alloc] initWithBoundsSize:img.size
                                                           requestHandler:^NSImage *(CGSize size) { return img; }];
            [self publish];
        });
    }] resume];
}

- (void)publish {
    MPNowPlayingInfoCenter *c = [MPNowPlayingInfoCenter defaultCenter];
    c.nowPlayingInfo = c.nowPlayingInfo; // goes through the swizzle, which merges our keys
    c.playbackState = !self.active ? MPNowPlayingPlaybackStateStopped
        : self.paused ? MPNowPlayingPlaybackStatePaused : MPNowPlayingPlaybackStatePlaying;
}

- (void)userContentController:(WKUserContentController *)ucc didReceiveScriptMessage:(WKScriptMessage *)msg {
    NSDictionary *b = [msg.body isKindOfClass:[NSDictionary class]] ? msg.body : nil;
    if (!b) return;
    if (msg.webView) self.web = msg.webView;
    NSString *(^str)(id) = ^NSString *(id v) { return [v isKindOfClass:[NSString class]] ? v : nil; };
    @synchronized (self) {
        self.active = [b[@"active"] boolValue];
        if (self.active) {
            self.title = str(b[@"title"]);
            self.subtitle = str(b[@"subtitle"]);
            self.artURL = str(b[@"artwork"]);
            self.duration = [b[@"duration"] doubleValue];
            self.position = [b[@"position"] doubleValue];
            self.rate = [b[@"rate"] doubleValue] ?: 1.0;
            self.paused = [b[@"paused"] boolValue];
            self.canSeek = [b[@"canSeek"] boolValue];
            self.live = [b[@"live"] boolValue];
            self.skip = [b[@"skip"] doubleValue];
        }
    }
    if (self.active) [self loadArtwork];
    [self updateCommands];
    [self publish];
}
@end

static void installNowPlaying(void) {
    Method m = class_getInstanceMethod([MPNowPlayingInfoCenter class], @selector(setNowPlayingInfo:));
    if (m && !sOrigSetInfo) sOrigSetInfo = method_setImplementation(m, (IMP)spSetNowPlayingInfo);
}


// ---- mpv bridge ----

typedef struct mpv_handle mpv_handle;
extern mpv_handle *mpv_create(void) __attribute__((weak_import));
extern void mpv_terminate_destroy(mpv_handle *) __attribute__((weak_import));

static pthread_mutex_t sMpvLock = PTHREAD_MUTEX_INITIALIZER;
static mpv_handle *sMpv;

static mpv_handle *spMpvCreate(void) {
    mpv_handle *h = mpv_create();
    pthread_mutex_lock(&sMpvLock);
    if (!sMpv) sMpv = h;
    pthread_mutex_unlock(&sMpvLock);
    return h;
}
static void spMpvTerminateDestroy(mpv_handle *h) {
    pthread_mutex_lock(&sMpvLock);
    if (h == sMpv) sMpv = NULL;
    pthread_mutex_unlock(&sMpvLock);
    mpv_terminate_destroy(h);
}
__attribute__((used, section("__DATA,__interpose"))) static const struct { const void *replacement, *replacee; }
    kMpvInterpose[] = {
        { (const void *)spMpvCreate, (const void *)mpv_create },
        { (const void *)spMpvTerminateDestroy, (const void *)mpv_terminate_destroy },
    };

typedef int (*mpv_set_string_fn)(mpv_handle *, const char *, const char *);
typedef char *(*mpv_get_string_fn)(mpv_handle *, const char *);
typedef void (*mpv_free_fn)(void *);
typedef const char *(*mpv_error_string_fn)(int);

// Properties the web UI may change. Anything else (scripts, config files, arbitrary filters) stays out of reach.
static NSSet<NSString *> *kSettable;
// Audio filter presets, labelled so we only ever add/remove our own entries in mpv's af chain.
static NSDictionary<NSString *, NSString *> *kAfPresets;
// Shader chains shipped in <root>/shaders/ (see the README / LICENSE there), in mpv's load order.
static NSDictionary<NSString *, NSArray<NSString *> *> *kShaderPresets;

@interface SPMpv : NSObject <WKScriptMessageHandler>
@property (weak) WKWebView *web;
@property (strong) NSMutableDictionary<NSString *, id> *originals; // value before our first change (NSNull = unset)
@property (strong) dispatch_queue_t queue;
+ (instancetype)shared;
@end

@implementation SPMpv
+ (instancetype)shared {
    static SPMpv *m;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        m = [SPMpv new];
        m.originals = [NSMutableDictionary dictionary];
        m.queue = dispatch_queue_create("stremio-plus.mpv", DISPATCH_QUEUE_SERIAL);
        kSettable = [NSSet setWithArray:@[
            @"deband", @"deband-iterations", @"deband-threshold", @"deband-range", @"deband-grain",
            @"scale", @"cscale", @"dscale", @"scale-antiring", @"dscale-antiring", @"cscale-antiring",
            @"correct-downscaling", @"linear-downscaling", @"sigmoid-upscaling",
            @"tone-mapping", @"hdr-compute-peak", @"gamut-mapping-mode",
            @"sub-delay",
        ]];
        // Anime4K v4 "Mode A (Fast)": restore + 2x CNN upscale, with downscalers for when 2x overshoots.
        kShaderPresets = @{ @"anime4k": @[
            @"anime4k/Anime4K_Clamp_Highlights.glsl", @"anime4k/Anime4K_Restore_CNN_M.glsl",
            @"anime4k/Anime4K_Upscale_CNN_x2_M.glsl", @"anime4k/Anime4K_AutoDownscalePre_x2.glsl",
            @"anime4k/Anime4K_AutoDownscalePre_x4.glsl", @"anime4k/Anime4K_Upscale_CNN_x2_S.glsl",
        ] };
        kAfPresets = @{
            @"night": @"@spnight:lavfi=[dynaudnorm=f=150:g=15]",
            // Lift the centre (dialogue) channel when downmixing 5.1 to stereo.
            @"dialogue": @"@spdialog:lavfi=[pan=stereo|FL=FC+0.6*FL+0.3*BL+0.3*SL|FR=FC+0.6*FR+0.3*BR+0.3*SR]",
        };
    });
    return m;
}

static NSString *spRoot(void);

- (void)reply:(NSDictionary *)d {
    WKWebView *web = self.web;
    if (!web) return;
    NSData *json = [NSJSONSerialization dataWithJSONObject:d options:0 error:nil];
    if (!json) return;
    NSString *js = [NSString stringWithFormat:
        @"window.dispatchEvent(new CustomEvent('stremio-plus-mpv',{detail:%@}))",
        [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding]];
    dispatch_async(dispatch_get_main_queue(), ^{ [web evaluateJavaScript:js completionHandler:nil]; });
}

// Called on self.queue with sMpvLock held.
static id spGet(mpv_handle *h, NSString *name) {
    static mpv_get_string_fn get; static mpv_free_fn fr;
    if (!get) { get = (mpv_get_string_fn)dlsym(RTLD_DEFAULT, "mpv_get_property_string"); fr = (mpv_free_fn)dlsym(RTLD_DEFAULT, "mpv_free"); }
    if (!get || !fr) return [NSNull null];
    char *v = get(h, name.UTF8String);
    if (!v) return [NSNull null];
    NSString *s = @(v) ?: @"";
    fr(v);
    return s;
}
static NSString *spSet(mpv_handle *h, NSString *name, NSString *value) {
    static mpv_set_string_fn set; static mpv_error_string_fn err;
    if (!set) { set = (mpv_set_string_fn)dlsym(RTLD_DEFAULT, "mpv_set_property_string"); err = (mpv_error_string_fn)dlsym(RTLD_DEFAULT, "mpv_error_string"); }
    if (!set) return @"no libmpv";
    int r = set(h, name.UTF8String, value.UTF8String);
    return r < 0 ? (err ? @(err(r)) : @"error") : nil;
}
static NSString *spCommand(mpv_handle *h, NSString *cmd) {
    static int (*run)(mpv_handle *, const char *); static mpv_error_string_fn err;
    if (!run) { run = dlsym(RTLD_DEFAULT, "mpv_command_string"); err = (mpv_error_string_fn)dlsym(RTLD_DEFAULT, "mpv_error_string"); }
    if (!run) return @"no libmpv";
    int r = run(h, cmd.UTF8String);
    return r < 0 ? (err ? @(err(r)) : @"error") : nil;
}

// value nil = back to what mpv had before our first change.
- (void)set:(mpv_handle *)h name:(NSString *)name value:(NSString *)value values:(NSMutableDictionary *)values errors:(NSMutableDictionary *)errors {
    if (!value) {
        id orig = self.originals[name];
        if (!orig) { values[name] = spGet(h, name); return; }
        value = [orig isKindOfClass:[NSString class]] ? orig : @"";
        [self.originals removeObjectForKey:name];
    } else if (!self.originals[name]) {
        self.originals[name] = spGet(h, name);
    }
    NSString *e = spSet(h, name, value);
    if (e) errors[name] = e;
    values[name] = spGet(h, name);
}

- (void)handle:(NSDictionary *)b {
    NSString *op = b[@"op"];
    id rid = b[@"id"] ?: [NSNull null];
    NSMutableDictionary *values = [NSMutableDictionary dictionary];
    NSMutableDictionary *errors = [NSMutableDictionary dictionary];
    pthread_mutex_lock(&sMpvLock);
    mpv_handle *h = sMpv;
    if (!h) {
        pthread_mutex_unlock(&sMpvLock);
        [self reply:@{ @"id": rid, @"ok": @NO, @"error": @"no mpv" }];
        return;
    }
    if ([op isEqual:@"get"]) {
        for (id n in b[@"names"]) if ([n isKindOfClass:[NSString class]]) values[n] = spGet(h, n);
    } else if ([op isEqual:@"set"]) {
        NSDictionary *props = [b[@"props"] isKindOfClass:[NSDictionary class]] ? b[@"props"] : @{};
        for (NSString *name in props) {
            if (![name isKindOfClass:[NSString class]] || ![kSettable containsObject:name]) { errors[name ?: @"?"] = @"not allowed"; continue; }
            id v = props[name];
            NSString *value = [v isKindOfClass:[NSString class]] ? v : [v isKindOfClass:[NSNumber class]] ? [v stringValue] : nil;
            [self set:h name:name value:value values:values errors:errors];
        }
    } else if ([op isEqual:@"forget"]) {
        // The shell has set these itself since our change (e.g. EDR tone mapping): keep its values, drop ours.
        for (id n in b[@"names"]) if ([n isKindOfClass:[NSString class]]) [self.originals removeObjectForKey:n];
    } else if ([op isEqual:@"shaders"]) {
        NSArray *files = [b[@"preset"] isKindOfClass:[NSString class]] ? kShaderPresets[b[@"preset"]] : nil;
        if (b[@"preset"] && b[@"preset"] != [NSNull null] && !files) errors[@"preset"] = @"unknown preset";
        else {
            NSString *dir = [spRoot() stringByAppendingPathComponent:@"shaders"];
            NSMutableArray *paths = [NSMutableArray array];
            for (NSString *f in files) [paths addObject:[dir stringByAppendingPathComponent:f]];
            for (NSString *path in paths) if (![[NSFileManager defaultManager] fileExistsAtPath:path]) errors[@"preset"] = @"shader missing";
            if (!errors.count) [self set:h name:@"glsl-shaders" value:files ? [paths componentsJoinedByString:@":"] : nil values:values errors:errors];
        }
    } else if ([op isEqual:@"af"]) {
        NSArray *want = [b[@"presets"] isKindOfClass:[NSArray class]] ? b[@"presets"] : @[];
        for (NSString *key in kAfPresets) {
            NSString *label = [[kAfPresets[key] componentsSeparatedByString:@":"] firstObject];
            spCommand(h, [NSString stringWithFormat:@"af remove %@", label]);
        }
        for (NSString *key in want) {
            NSString *f = [key isKindOfClass:[NSString class]] ? kAfPresets[key] : nil;
            if (!f) { errors[key] = @"unknown preset"; continue; }
            NSString *e = spCommand(h, [NSString stringWithFormat:@"af add \"%@\"", f]);
            if (e) errors[key] = e;
        }
        values[@"af"] = spGet(h, @"af");
    } else {
        errors[@"op"] = @"unknown op";
    }
    pthread_mutex_unlock(&sMpvLock);
    [self reply:@{ @"id": rid, @"ok": @(errors.count == 0), @"values": values, @"errors": errors }];
}

- (void)userContentController:(WKUserContentController *)ucc didReceiveScriptMessage:(WKScriptMessage *)msg {
    NSDictionary *b = [msg.body isKindOfClass:[NSDictionary class]] ? msg.body : nil;
    if (!b) return;
    if (msg.webView) self.web = msg.webView;
    dispatch_async(self.queue, ^{ [self handle:b]; });
}
@end

// ---- dev eval channel ----

static void startDevEval(WKWebView *web, NSString *root) {
    NSString *dir = [root stringByAppendingPathComponent:@"addon/data/dev"];
    BOOL isDir = NO;
    if (![[NSFileManager defaultManager] fileExistsAtPath:dir isDirectory:&isDir] || !isDir) return;
    NSString *in = [dir stringByAppendingPathComponent:@"eval.js"];
    NSString *out = [dir stringByAppendingPathComponent:@"eval.out.json"];
    __weak WKWebView *weakWeb = web;
    NSLog(@"[stremio-plus] dev eval channel on %@", in);
    [NSTimer scheduledTimerWithTimeInterval:0.3 repeats:YES block:^(NSTimer *t) {
        WKWebView *w = weakWeb;
        if (!w) { [t invalidate]; return; }
        NSString *js = [NSString stringWithContentsOfFile:in encoding:NSUTF8StringEncoding error:nil];
        if (!js) return;
        [[NSFileManager defaultManager] removeItemAtPath:in error:nil];
        if (@available(macOS 11.0, *)) {
            [w callAsyncJavaScript:js arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld
                 completionHandler:^(id result, NSError *error) {
                NSDictionary *d = error ? @{ @"error": error.localizedDescription ?: @"error",
                                              @"detail": error.userInfo[@"WKJavaScriptExceptionMessage"] ?: @"" }
                                        : @{ @"result": result ?: [NSNull null] };
                NSData *json = [NSJSONSerialization isValidJSONObject:d]
                    ? [NSJSONSerialization dataWithJSONObject:d options:0 error:nil]
                    : [@"{\"result\":\"(not JSON)\"}" dataUsingEncoding:NSUTF8StringEncoding];
                [json writeToFile:out atomically:YES];
            }];
        }
    }];
}

static WKWebView *findWebView(NSView *v) {
    if ([v isKindOfClass:[WKWebView class]]) return (WKWebView *)v;
    for (NSView *s in v.subviews) {
        WKWebView *w = findWebView(s);
        if (w) return w;
    }
    return nil;
}

static NSString *const kFlagJS =
    @"window.__stremioPlusChrome = true; window.__stremioPlusMpv = true; window.dispatchEvent(new Event('stremio-plus-chrome'));";

static void configure(NSWindow *w) {
    if (objc_getAssociatedObject(w, &kStateKey)) return;
    WKWebView *web = findWebView(w.contentView);
    if (!web) return;

    SPChromeState *state = [SPChromeState new];
    state.window = w;
    objc_setAssociatedObject(w, &kStateKey, state, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    // AppKit keeps the content size when the content view goes full-size, so the frame would lose the title bar's
    // height (and Stremio saves that, so the window shrank on every launch). Keep the frame.
    NSRect frame = w.frame;
    w.styleMask |= NSWindowStyleMaskFullSizeContentView;
    if (!NSEqualRects(w.frame, frame)) [w setFrame:frame display:YES];
    w.titlebarAppearsTransparent = YES;
    w.titleVisibility = NSWindowTitleHidden;
    if (@available(macOS 11.0, *)) w.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;

    // The web view keeps its old frame after the content view grows into the title bar area; fill it.
    NSView *host = web.superview;
    web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    web.frame = host.bounds;

    SPDragView *drag = [[SPDragView alloc] initWithFrame:host.bounds];
    drag.state = state;
    drag.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [host addSubview:drag positioned:NSWindowAbove relativeTo:web];

    WKUserContentController *ucc = web.configuration.userContentController;
    [ucc addScriptMessageHandler:state name:@"stremioPlusChrome"];
    [ucc addScriptMessageHandler:[SPMedia shared] name:@"stremioPlusMedia"];
    [SPMedia shared].web = web;
    [ucc addScriptMessageHandler:[SPMpv shared] name:@"stremioPlusMpv"];
    [SPMpv shared].web = web;
    startDevEval(web, spRoot());
    [ucc addUserScript:[[WKUserScript alloc] initWithSource:kFlagJS
                                              injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                           forMainFrameOnly:YES]];
    [web evaluateJavaScript:kFlagJS completionHandler:nil];

    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    for (NSNotificationName n in @[NSWindowDidResizeNotification, NSWindowDidEndLiveResizeNotification,
                                   NSWindowDidExitFullScreenNotification, NSWindowDidBecomeKeyNotification,
                                   NSWindowDidResignKeyNotification, NSWindowDidChangeBackingPropertiesNotification]) {
        [nc addObserverForName:n object:w queue:nil usingBlock:^(NSNotification *note) {
            [state apply];
            dispatch_async(dispatch_get_main_queue(), ^{ [state apply]; });
        }];
    }
    [state apply];
    NSLog(@"[stremio-plus] chrome attached to window %ld", (long)w.windowNumber);
}

// Stremio+ root: a bundled copy finds it in libstremio-plus-chrome.root next to itself (written by the patch); the
// launcher-injected copy lives in <root>/shell/build/.
static NSString *stremioPlusRoot(void);
static NSString *spRoot(void) { return stremioPlusRoot(); }
static NSString *stremioPlusRoot(void) {
    Dl_info info;
    if (!dladdr((const void *)stremioPlusRoot, &info) || !info.dli_fname) return nil;
    NSString *dir = [@(info.dli_fname) stringByDeletingLastPathComponent];
    NSString *pointer = [NSString stringWithContentsOfFile:[dir stringByAppendingPathComponent:@"libstremio-plus-chrome.root"]
                                                  encoding:NSUTF8StringEncoding error:nil];
    pointer = [pointer stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (pointer.length) return pointer;
    return [[dir stringByDeletingLastPathComponent] stringByDeletingLastPathComponent];
}

__attribute__((constructor)) static void stremioPlusChromeInit(void) {
    // Don't leak into child processes (node server, ffmpeg).
    unsetenv("DYLD_INSERT_LIBRARIES");
    NSString *root = stremioPlusRoot();
    if (root && [[NSFileManager defaultManager] fileExistsAtPath:[root stringByAppendingPathComponent:@"addon/data/.vanilla"]]) {
        NSLog(@"[stremio-plus] vanilla mode: leaving the window alone");
        return;
    }
    installNowPlaying();
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *t) {
            for (NSWindow *w in [NSApp windows]) configure(w);
        }];
    });
}
