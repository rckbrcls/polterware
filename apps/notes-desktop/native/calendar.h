#import <Foundation/Foundation.h>
static NSString *NotesISO(NSDate *date) {
  NSISO8601DateFormatter *f = [NSISO8601DateFormatter new];
  f.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
  return [f stringFromDate:date];
}
static NSDate *NotesDate(NSString *text) {
  if (![text isKindOfClass:NSString.class]) return nil;
  NSISO8601DateFormatter *f = [NSISO8601DateFormatter new];
  f.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
  return [f dateFromString:text];
}
// Match the OS delivery date, never the response/click date. This is essential for
// delayed clicks on repeating reminders and for all-day keys delivered at 09:00.
static NSString *NotesOccurrence(NSDateComponents *components, NSDate *deliveredAt, NSString *first, NSString *firstFireAt) {
  NSCalendar *calendar = [NSCalendar calendarWithIdentifier:NSCalendarIdentifierGregorian];
  calendar.timeZone = components.timeZone ?: NSTimeZone.localTimeZone;
  NSDate *anchor = NotesDate(first), *firstFire = NotesDate(firstFireAt);
  if (!anchor || !firstFire || !deliveredAt) return @"";
  NSDate *fire = [calendar nextDateAfterDate:[deliveredAt dateByAddingTimeInterval:0.001]
    matchingComponents:components options:NSCalendarSearchBackwards | NSCalendarMatchNextTimePreservingSmallerUnits | NSCalendarMatchFirst];
  if (!fire || [fire compare:firstFire] == NSOrderedAscending) return @"";
  if ([anchor isEqualToDate:firstFire]) return NotesISO(fire);
  // Preserve the anchor's wall-clock occurrence key when notification delivery uses
  // a different time (all-day settings). Absolute subtraction would break over DST.
  NSDateComponents *offset = [calendar components:NSCalendarUnitDay fromDate:[calendar startOfDayForDate:firstFire] toDate:[calendar startOfDayForDate:anchor] options:0];
  NSDate *day = [calendar dateByAddingComponents:offset toDate:fire options:0];
  NSDateComponents *time = [calendar components:NSCalendarUnitHour | NSCalendarUnitMinute | NSCalendarUnitSecond | NSCalendarUnitNanosecond fromDate:anchor];
  NSDate *occurrence = [calendar dateBySettingHour:time.hour minute:time.minute second:time.second ofDate:day options:NSCalendarMatchNextTimePreservingSmallerUnits | NSCalendarMatchFirst];
  occurrence = [occurrence dateByAddingTimeInterval:time.nanosecond / 1e9];
  return occurrence && [occurrence compare:anchor] != NSOrderedAscending ? NotesISO(occurrence) : @"";
}
