#import <AppKit/AppKit.h>
#import <Sparkle/Sparkle.h>
#include <node_api.h>

// All calls originate in Electron Main on the AppKit thread. Keep the controller alive
// for the lifetime of the process, as required by Sparkle's programmatic setup.
static SPUStandardUpdaterController *controller;
static BOOL installing = NO;

@interface PolterwareUpdaterDelegate : NSObject <SPUUpdaterDelegate>
@end
@implementation PolterwareUpdaterDelegate
- (void)updater:(SPUUpdater *)updater willInstallUpdate:(SUAppcastItem *)item {
  installing = YES;
}
- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error {
  installing = NO;
}
- (BOOL)updater:(SPUUpdater *)updater shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item untilInvokingBlock:(void (^)(void))installHandler {
  installing = YES;
  return NO;
}
@end
static PolterwareUpdaterDelegate *updaterDelegate;

static napi_value JsBoolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

static napi_value Start(napi_env env, napi_callback_info info) {
  if (![NSThread isMainThread]) {
    napi_throw_error(env, nullptr, "Sparkle must start on the main thread.");
    return nullptr;
  }
  if (controller) return JsBoolean(env, true);
  @autoreleasepool {
    updaterDelegate = [[PolterwareUpdaterDelegate alloc] init];
    controller = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:NO updaterDelegate:updaterDelegate userDriverDelegate:nil];
    controller.updater.updateCheckInterval = 86400;
    NSError *error = nil;
    if (![controller.updater startUpdater:&error]) {
      const char *message = error.localizedDescription.UTF8String;
      napi_throw_error(env, nullptr, message ?: "Sparkle could not start.");
      controller = nil;
      return nullptr;
    }
  }
  return JsBoolean(env, true);
}

static napi_value Check(napi_env env, napi_callback_info info) {
  if (![NSThread isMainThread] || !controller) {
    napi_throw_error(env, nullptr, "Sparkle is not ready.");
    return nullptr;
  }
  if (controller.updater.canCheckForUpdates) [controller checkForUpdates:nil];
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

static napi_value IsInstalling(napi_env env, napi_callback_info info) {
  return JsBoolean(env, installing);
}

static napi_value Register(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"check", nullptr, Check, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"isInstalling", nullptr, IsInstalling, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 3, properties);
  return exports;
}
NAPI_MODULE(polterware_updater, Register)
