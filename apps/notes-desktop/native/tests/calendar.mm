#import "../calendar.h"
#include <cstdio>
static void Check(NSString *actual, NSString *expected) {
  if (![actual isEqual:expected]) { fprintf(stderr, "Occurrence mismatch: %s != %s\n", actual.UTF8String, expected.UTF8String); exit(1); }
}
int main() {
  @autoreleasepool {
    NSDateComponents *daily = [NSDateComponents new];
    daily.timeZone = [NSTimeZone timeZoneWithName:@"America/Sao_Paulo"]; daily.hour = 9; daily.minute = 0; daily.second = 0;
    Check(NotesOccurrence(daily, NotesDate(@"2026-10-05T12:00:00.000Z"), @"2026-10-04T12:00:00.000Z", @"2026-10-04T12:00:00.000Z"), @"2026-10-05T12:00:00.000Z");
    Check(NotesOccurrence(daily, NotesDate(@"2026-10-05T12:00:03.000Z"), @"2026-10-04T03:00:00.000Z", @"2026-10-04T12:00:00.000Z"), @"2026-10-05T03:00:00.000Z");
    Check(NotesOccurrence(daily, NotesDate(@"2026-10-03T12:00:00.000Z"), @"2026-10-04T12:00:00.000Z", @"2026-10-04T12:00:00.000Z"), @"");
    NSDateComponents *weekly = [NSDateComponents new];
    weekly.timeZone = [NSTimeZone timeZoneWithName:@"UTC"]; weekly.weekday = 2; weekly.hour = 9; weekly.minute = 0; weekly.second = 0;
    Check(NotesOccurrence(weekly, NotesDate(@"2026-10-12T09:00:05.000Z"), @"2026-10-05T09:00:00.000Z", @"2026-10-05T09:00:00.000Z"), @"2026-10-12T09:00:00.000Z");
    NSDateComponents *allDay = [NSDateComponents new];
    allDay.timeZone = [NSTimeZone timeZoneWithName:@"America/New_York"]; allDay.hour = 9; allDay.minute = 0; allDay.second = 0;
    // Midnight before the DST boundary has a different UTC offset than 09:00.
    Check(NotesOccurrence(allDay, NotesDate(@"2026-03-08T13:00:01.000Z"), @"2026-03-07T05:00:00.000Z", @"2026-03-07T14:00:00.000Z"), @"2026-03-08T05:00:00.000Z");
    NSDateComponents *hourly = [NSDateComponents new]; hourly.timeZone = [NSTimeZone timeZoneWithName:@"UTC"]; hourly.minute = 15; hourly.second = 0;
    Check(NotesOccurrence(hourly, NotesDate(@"2026-10-05T13:15:00.000Z"), @"2026-10-04T11:15:00.000Z", @"2026-10-04T11:15:00.000Z"), @"2026-10-05T13:15:00.000Z");
    NSDateComponents *minutely = [NSDateComponents new]; minutely.timeZone = [NSTimeZone timeZoneWithName:@"UTC"]; minutely.second = 0;
    Check(NotesOccurrence(minutely, NotesDate(@"2026-10-05T13:18:05.000Z"), @"2026-10-04T11:15:00.000Z", @"2026-10-04T11:15:00.000Z"), @"2026-10-05T13:18:00.000Z");
    puts("PASS: seven native calendar occurrence cases (delivery date, all-day, DST, anchor bounds)");
  }
}
