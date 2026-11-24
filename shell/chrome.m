// Stremio+ window chrome. Injected into the stock Stremio.app with DYLD_INSERT_LIBRARIES (its signature allows it;
// the bundle is never modified). Hides the native title bar so the web UI runs to the top edge, moves the traffic
// lights into Stremio's nav bar, and lets the empty parts of that bar drag the window like a real title bar.
//
// The web UI (web/src/mods/macChrome.ts) sees `window.__stremioPlusChrome` and posts its geometry to the
// `stremioPlusChrome` message handler, in CSS px (== points), top-left origin:
//   { lights: { x, w, cy } | null,   // column to centre the traffic lights in, and the vertical centre
//     drag: [[x,y,w,h]...],           // window-drag areas (the nav bar)
//     holes: [[x,y,w,h]...],          // interactive elements inside them
//     hidden: bool }                  // hide the traffic lights (player with controls hidden)
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

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

static WKWebView *findWebView(NSView *v) {
    if ([v isKindOfClass:[WKWebView class]]) return (WKWebView *)v;
    for (NSView *s in v.subviews) {
        WKWebView *w = findWebView(s);
        if (w) return w;
    }
    return nil;
}

static NSString *const kFlagJS =
    @"window.__stremioPlusChrome = true; window.dispatchEvent(new Event('stremio-plus-chrome'));";

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

__attribute__((constructor)) static void stremioPlusChromeInit(void) {
    // Don't leak into child processes (node server, ffmpeg).
    unsetenv("DYLD_INSERT_LIBRARIES");
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *t) {
            for (NSWindow *w in [NSApp windows]) configure(w);
        }];
    });
}
