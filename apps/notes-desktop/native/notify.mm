#import <AppKit/AppKit.h>
#import <UserNotifications/UserNotifications.h>
#include <napi.h>
#include <cstdlib>
#include <memory>
#include <mutex>
#import "calendar.h"

// Main only. A per-environment bridge owns callbacks; Cocoa never calls V8 directly.
@interface NotesNotifyDelegate : NSObject <UNUserNotificationCenterDelegate>
@property BOOL receivedAction;
@property(copy) void (^emit)(NSDictionary *);
@property(strong) NSMutableDictionary<NSString *, id> *completions;
@property(strong) id wakeObserver;
@property(strong) id timezoneObserver;
- (void)finish:(NSString *)token;
- (void)close;
@end

static BOOL Owned(NSString *value) {
  return [value isKindOfClass:NSString.class] && ([value hasPrefix:@"rem:"] || [value hasPrefix:@"one:"]);
}
static NSString *Auth(UNAuthorizationStatus status) {
  switch (status) {
    case UNAuthorizationStatusAuthorized: return @"authorized";
    case UNAuthorizationStatusDenied: return @"denied";
    case UNAuthorizationStatusNotDetermined: return @"notDetermined";
    case UNAuthorizationStatusProvisional: return @"provisional";
    default: return @"unknown";
  }
}
static NSArray *Rows(NSArray<UNNotificationRequest *> *requests) {
  NSMutableArray *rows = [NSMutableArray array];
  for (UNNotificationRequest *r in requests) {
    // Pending inspection intentionally excludes title/body and unrelated app payloads.
    if (Owned(r.identifier)) [rows addObject:@{@"id":r.identifier, @"hash":r.content.userInfo[@"hash"] ?: @"", @"repeats":@(r.trigger.repeats)}];
  }
  return rows;
}
// Repeating userInfo holds the first occurrence. Resolve the occurrence represented by
// this OS delivery (not click time), including a delayed click and timezone/DST changes.
static NSString *Occurrence(UNNotification *notification) {
  NSDictionary *info = notification.request.content.userInfo;
  NSString *first = info[@"occurrenceAt"] ?: @"";
  if (!notification.request.trigger.repeats || ![notification.request.trigger isKindOfClass:UNCalendarNotificationTrigger.class]) return first;
  NSDateComponents *components = ((UNCalendarNotificationTrigger *)notification.request.trigger).dateComponents;
  return NotesOccurrence(components, notification.date, first, info[@"fireAt"] ?: first);
}
@implementation NotesNotifyDelegate
- (instancetype)init {
  self = [super init];
  if (self) {
    self.completions = [NSMutableDictionary dictionary];
    __weak NotesNotifyDelegate *weakSelf = self;
    self.wakeObserver = [[[NSWorkspace sharedWorkspace] notificationCenter] addObserverForName:NSWorkspaceDidWakeNotification object:nil queue:nil usingBlock:^(NSNotification *) {
      NotesNotifyDelegate *s = weakSelf;
      if (s.emit) s.emit(@{@"event":@"refresh", @"reason":@"wake"});
    }];
    self.timezoneObserver = [[NSNotificationCenter defaultCenter] addObserverForName:NSSystemTimeZoneDidChangeNotification object:nil queue:nil usingBlock:^(NSNotification *) {
      NotesNotifyDelegate *s = weakSelf;
      if (s.emit) s.emit(@{@"event":@"refresh", @"reason":@"timezone"});
    }];
  }
  return self;
}
- (void)finish:(NSString *)token {
  void (^completion)(void);
  @synchronized (self) { completion = self.completions[token]; [self.completions removeObjectForKey:token]; }
  if (completion) completion();
}
- (void)close {
  if (self.wakeObserver) [[[NSWorkspace sharedWorkspace] notificationCenter] removeObserver:self.wakeObserver];
  if (self.timezoneObserver) [[NSNotificationCenter defaultCenter] removeObserver:self.timezoneObserver];
  self.wakeObserver = nil; self.timezoneObserver = nil; self.emit = nil;
  NSArray *tokens;
  @synchronized (self) { tokens = self.completions.allKeys; }
  for (NSString *token in tokens) [self finish:token];
}
- (void)userNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completion {
  if (Owned(notification.request.identifier) && self.emit) self.emit(@{@"event":@"refresh", @"reason":@"delivered", @"id":notification.request.identifier});
  completion(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList | UNNotificationPresentationOptionSound);
}
- (void)userNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler:(void (^)(void))completion {
  if (!Owned(response.notification.request.identifier) || !self.emit) { completion(); return; }
  @synchronized (self) { self.receivedAction = YES; }
  NSString *token = NSUUID.UUID.UUIDString;
  @synchronized (self) { self.completions[token] = [completion copy]; }
  NSDictionary *info = response.notification.request.content.userInfo;
  self.emit(@{@"event":@"action", @"token":token, @"action":response.actionIdentifier,
    @"id":response.notification.request.identifier, @"noteId":info[@"noteId"] ?: @"",
    @"occurrenceAt":Occurrence(response.notification), @"receivedAtMs":@([NSDate.date timeIntervalSince1970] * 1000)});
  // OS completion must not hang on a failed core or a shutdown race.
  __weak NotesNotifyDelegate *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 25 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ [weakSelf finish:token]; });
}
@end

struct Bridge {
  napi_threadsafe_function sink = nullptr;
  std::mutex mutex;
  bool live = false;
  __strong NotesNotifyDelegate *delegate = nil;
  bool IsLive() { std::lock_guard<std::mutex> lock(mutex); return live; }
  void Emit(NSDictionary *value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if (!data) return;
    auto text = new std::string((const char *)data.bytes, data.length);
    std::lock_guard<std::mutex> lock(mutex);
    if (!live || napi_call_threadsafe_function(sink, text, napi_tsfn_nonblocking) != napi_ok) delete text;
  }
  void Reply(NSString *rid, id value, NSString *error = nil) {
    Emit(error ? @{@"rid":rid, @"error":error} : @{@"rid":rid, @"value":value ?: @YES});
  }
  void Close() {
    { std::lock_guard<std::mutex> lock(mutex);
      if (!live) return;
      live = false;
      napi_release_threadsafe_function(sink, napi_tsfn_abort);
      sink = nullptr;
    }
    UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
    if (center.delegate == delegate) center.delegate = nil;
    [delegate close]; delegate = nil;
  }
};
using SharedBridge = std::shared_ptr<Bridge>;
static void CallJS(napi_env env, napi_value callback, void *, void *data) {
  std::unique_ptr<std::string> text((std::string *)data);
  // Also runs on TSFN abort: free data even when the environment has gone away.
  if (!env || !callback) return;
  napi_value argument, undefined;
  if (napi_create_string_utf8(env, text->data(), text->size(), &argument) != napi_ok) return;
  napi_get_undefined(env, &undefined);
  napi_call_function(env, undefined, callback, 1, &argument, nullptr);
}
static UNNotificationRequest *Request(NSDictionary *item) {
  UNMutableNotificationContent *content = [UNMutableNotificationContent new];
  content.title = item[@"title"]; content.body = item[@"body"]; content.categoryIdentifier = item[@"category"];
  NSString *sound = item[@"sound"];
  content.sound = [sound isEqual:@"none"] ? nil : ([sound isEqual:@"default"] ? UNNotificationSound.defaultSound : [UNNotificationSound soundNamed:sound]);
  NSMutableDictionary *info = [@{@"noteId":item[@"noteId"], @"hash":item[@"hash"], @"occurrenceAt":item[@"occurrenceAt"], @"fireAt":item[@"fireAt"]} mutableCopy];
  UNNotificationTrigger *trigger;
  NSDictionary *repeat = item[@"repeat"];
  if ([repeat isKindOfClass:NSDictionary.class]) {
    NSDateComponents *c = [NSDateComponents new];
    c.calendar = [NSCalendar calendarWithIdentifier:NSCalendarIdentifierGregorian];
    c.timeZone = [NSTimeZone timeZoneWithName:repeat[@"tz"]];
    for (NSString *key in @[@"month", @"day", @"weekday", @"hour", @"minute", @"second"]) if (repeat[key]) [c setValue:repeat[key] forKey:key];
    // Planner omits second for hourly/daily/weekly. A wildcard second would fire 60 times.
    if (c.second == NSDateComponentUndefined && (c.hour != NSDateComponentUndefined || c.minute != NSDateComponentUndefined)) c.second = 0;
    trigger = [UNCalendarNotificationTrigger triggerWithDateMatchingComponents:c repeats:YES];
    info[@"repeat"] = repeat;
  } else {
    NSDate *fire = NotesDate(item[@"fireAt"]);
    if (!fire || fire.timeIntervalSinceNow <= 0) return nil;
    trigger = [UNTimeIntervalNotificationTrigger triggerWithTimeInterval:MAX(0.1, fire.timeIntervalSinceNow) repeats:NO];
  }
  content.userInfo = info;
  return [UNNotificationRequest requestWithIdentifier:item[@"id"] content:content trigger:trigger];
}
static BOOL ValidPlan(id input) {
  if (![input isKindOfClass:NSArray.class] || [input count] > 60) return NO;
  NSMutableSet *ids = [NSMutableSet set];
  for (id item in input) {
    if (![item isKindOfClass:NSDictionary.class] || !Owned(item[@"id"]) || [ids containsObject:item[@"id"]]) return NO;
    for (NSString *key in @[@"title", @"body", @"noteId", @"occurrenceAt", @"fireAt", @"category", @"hash", @"sound"])
      if (![item[key] isKindOfClass:NSString.class]) return NO;
    if (!NotesDate(item[@"fireAt"]) || !NotesDate(item[@"occurrenceAt"])) return NO;
    if (![@[@"reminder", @"reminder-focus", @"focus-phase"] containsObject:item[@"category"]]) return NO;
    if (item[@"repeat"] != NSNull.null && ![item[@"repeat"] isKindOfClass:NSDictionary.class]) return NO;
    if ([item[@"repeat"] isKindOfClass:NSDictionary.class] && ![NSTimeZone timeZoneWithName:item[@"repeat"][@"tz"]]) return NO;
    [ids addObject:item[@"id"]];
  }
  return YES;
}
static void AddItems(SharedBridge bridge, NSArray *items, NSUInteger index, NSMutableArray *added, NSString *rid, NSArray *stale, NSUInteger unchanged) {
  if (!bridge->IsLive()) return;
  if (index == items.count) { bridge->Reply(rid, @{@"added":added, @"removed":stale, @"unchanged":@(unchanged)}); return; }
  NSDictionary *item = items[index];
  UNNotificationRequest *request = Request(item);
  if (!request) { bridge->Reply(rid, nil, @"expired-request"); return; }
  [UNUserNotificationCenter.currentNotificationCenter addNotificationRequest:request withCompletionHandler:^(NSError *error) {
    if (error) { bridge->Reply(rid, nil, @"schedule-failed"); return; }
    [added addObject:item[@"id"]];
    AddItems(bridge, items, index + 1, added, rid, stale, unchanged);
  }];
}
static void Send(SharedBridge bridge, const Napi::CallbackInfo &args) {
  if (args.Length() != 3 || !args[0].IsString() || !args[1].IsString() || !args[2].IsString()) { Napi::TypeError::New(args.Env(), "Invalid native command").ThrowAsJavaScriptException(); return; }
  NSString *rid = [NSString stringWithUTF8String:args[0].As<Napi::String>().Utf8Value().c_str()];
  NSString *method = [NSString stringWithUTF8String:args[1].As<Napi::String>().Utf8Value().c_str()];
  std::string raw = args[2].As<Napi::String>().Utf8Value();
  NSError *jsonError = nil;
  id input = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:raw.data() length:raw.size()] options:NSJSONReadingFragmentsAllowed error:&jsonError];
  if (jsonError) { bridge->Reply(rid, nil, @"invalid-json"); return; }
  UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
  if ([method isEqual:@"requestAuthorization"]) {
    [center requestAuthorizationWithOptions:UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge completionHandler:^(BOOL granted, NSError *error) { bridge->Reply(rid, @(granted), error ? @"authorization-failed" : nil); }];
  } else if ([method isEqual:@"status"]) {
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
      [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray *requests) { bridge->Reply(rid, @{@"authorization":Auth(settings.authorizationStatus), @"pendingCount":@(Rows(requests).count)}); }];
    }];
  } else if ([method isEqual:@"pending"]) {
    [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray *requests) { bridge->Reply(rid, Rows(requests)); }];
  } else if ([method isEqual:@"removeAll"]) {
    if (!Owned(input)) { bridge->Reply(rid, nil, @"foreign-prefix"); return; }
    [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray *requests) {
      NSMutableArray *ids = [NSMutableArray array];
      for (UNNotificationRequest *r in requests) if (Owned(r.identifier) && [r.identifier hasPrefix:input]) [ids addObject:r.identifier];
      [center removePendingNotificationRequestsWithIdentifiers:ids];
      [center getDeliveredNotificationsWithCompletionHandler:^(NSArray<UNNotification *> *notifications) {
        NSMutableArray *delivered = [NSMutableArray array];
        for (UNNotification *n in notifications) if (Owned(n.request.identifier) && [n.request.identifier hasPrefix:input]) [delivered addObject:n.request.identifier];
        [center removeDeliveredNotificationsWithIdentifiers:delivered]; bridge->Reply(rid, ids);
      }];
    }];
  } else if ([method isEqual:@"apply"]) {
    if (!ValidPlan(input)) { bridge->Reply(rid, nil, @"invalid-plan"); return; }
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
      if (!bridge->IsLive()) return;
      if (settings.authorizationStatus != UNAuthorizationStatusAuthorized && settings.authorizationStatus != UNAuthorizationStatusProvisional) { bridge->Reply(rid, nil, @"permission-denied-existing-preserved"); return; }
      [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray *requests) {
        if (!bridge->IsLive()) return;
        NSMutableDictionary *hashes = [NSMutableDictionary dictionary];
        for (UNNotificationRequest *r in requests) hashes[r.identifier] = r.content.userInfo[@"hash"] ?: @"";
        NSMutableSet *desired = [NSMutableSet set];
        NSMutableArray *changed = [NSMutableArray array], *stale = [NSMutableArray array];
        NSUInteger unchanged = 0;
        for (NSDictionary *item in input) {
          [desired addObject:item[@"id"]];
          if ([hashes[item[@"id"]] isEqual:item[@"hash"]]) unchanged++; else [changed addObject:item];
        }
        for (UNNotificationRequest *r in requests) if (Owned(r.identifier) && ![desired containsObject:r.identifier]) [stale addObject:r.identifier];
        // Free obsolete slots first, avoiding temporary budget overflow on a full replacement.
        // An add failure reports refresh-pending; the next complete Plan repairs the diff.
        [center removePendingNotificationRequestsWithIdentifiers:stale];
        AddItems(bridge, changed, 0, [NSMutableArray array], rid, stale, unchanged);
      }];
    }];
  } else if ([method isEqual:@"finishAction"]) {
    if (![input isKindOfClass:NSString.class]) { bridge->Reply(rid, nil, @"invalid-action-token"); return; }
    [bridge->delegate finish:input]; bridge->Reply(rid, @YES);
  } else if ([method isEqual:@"emitSystemEvent"]) {
    if (!std::getenv("PWNOTES_NOTIFY_E2E") || ![input isKindOfClass:NSString.class]) { bridge->Reply(rid, nil, @"unknown-command"); return; }
    if ([input isEqual:@"timezone"]) [[NSNotificationCenter defaultCenter] postNotificationName:NSSystemTimeZoneDidChangeNotification object:nil];
    else if ([input isEqual:@"wake"]) [[[NSWorkspace sharedWorkspace] notificationCenter] postNotificationName:NSWorkspaceDidWakeNotification object:nil];
    else { bridge->Reply(rid, nil, @"unknown-command"); return; }
    bridge->Reply(rid, @YES);
  } else if ([method isEqual:@"delivered"]) {
    if (!std::getenv("PWNOTES_NOTIFY_E2E")) { bridge->Reply(rid, nil, @"unknown-command"); return; }
    [center getDeliveredNotificationsWithCompletionHandler:^(NSArray<UNNotification *> *notifications) {
      NSMutableArray *rows = [NSMutableArray array];
      for (UNNotification *n in notifications) if (Owned(n.request.identifier))
        [rows addObject:@{@"id":n.request.identifier, @"title":n.request.content.title ?: @""}];
      bridge->Reply(rid, rows);
    }];
  } else bridge->Reply(rid, nil, @"unknown-command");
}
static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  auto bridge = std::make_shared<Bridge>();
  auto cleanup = new SharedBridge(bridge);
  env.AddCleanupHook([](SharedBridge *value) { (*value)->Close(); delete value; }, cleanup);
  exports.Set("start", Napi::Function::New(env, [bridge](const Napi::CallbackInfo &args) {
    if (bridge->live || args.Length() != 1 || !args[0].IsFunction()) { Napi::Error::New(args.Env(), "Native notifications already started or invalid callback").ThrowAsJavaScriptException(); return; }
    napi_value name = Napi::String::New(args.Env(), "notes-notify");
    if (napi_create_threadsafe_function(args.Env(), args[0], nullptr, name, 0, 1, nullptr, nullptr, nullptr, CallJS, &bridge->sink) != napi_ok) { Napi::Error::New(args.Env(), "Cannot create notification callback").ThrowAsJavaScriptException(); return; }
    napi_unref_threadsafe_function(args.Env(), bridge->sink);
    bridge->live = true;
    bridge->delegate = [NotesNotifyDelegate new];
    std::weak_ptr<Bridge> weak = bridge;
    bridge->delegate.emit = ^(NSDictionary *value) { if (auto target = weak.lock()) target->Emit(value); };
    UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
    center.delegate = bridge->delegate; // Install before Electron readiness.
    UNNotificationAction *done = [UNNotificationAction actionWithIdentifier:@"DONE" title:@"Done" options:0];
    UNNotificationAction *snooze = [UNNotificationAction actionWithIdentifier:@"SNOOZE" title:@"Snooze" options:0];
    UNNotificationAction *open = [UNNotificationAction actionWithIdentifier:@"OPEN" title:@"Open" options:UNNotificationActionOptionForeground];
    UNNotificationAction *focus = [UNNotificationAction actionWithIdentifier:@"START_FOCUS" title:@"Start focus" options:UNNotificationActionOptionForeground];
    [center setNotificationCategories:[NSSet setWithArray:@[
      [UNNotificationCategory categoryWithIdentifier:@"reminder" actions:@[done,snooze,open] intentIdentifiers:@[] options:0],
      [UNNotificationCategory categoryWithIdentifier:@"reminder-focus" actions:@[done,snooze,focus,open] intentIdentifiers:@[] options:0],
      [UNNotificationCategory categoryWithIdentifier:@"focus-phase" actions:@[] intentIdentifiers:@[] options:0]]]];
  }));
  exports.Set("wasActionLaunch", Napi::Function::New(env, [bridge](const Napi::CallbackInfo &args) {
    BOOL value;
    @synchronized (bridge->delegate) { value = bridge->delegate.receivedAction; }
    return Napi::Boolean::New(args.Env(), value);
  }));
  exports.Set("send", Napi::Function::New(env, [bridge](const Napi::CallbackInfo &args) { if (!bridge->live) { Napi::Error::New(args.Env(), "Native notifications closed").ThrowAsJavaScriptException(); return; } Send(bridge, args); }));
  exports.Set("close", Napi::Function::New(env, [bridge](const Napi::CallbackInfo &) { bridge->Close(); }));
  return exports;
}
NODE_API_MODULE(notify, Init)
