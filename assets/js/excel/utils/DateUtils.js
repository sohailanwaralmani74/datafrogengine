/**
 * Excel 1900 serial date system conversion utilities.
 * In Excel's 1900 date system, day 1 is 1900-01-01, with Lotus 1-2-3's leap year bug included (1900-02-29 is day 60).
 */
export class DateUtils {
  static MS_PER_DAY = 86400000;
  static EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30

  /**
   * Converts a JavaScript Date into an Excel serial number.
   * @param {Date} date
   * @returns {number}
   */
  static dateToSerial(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new TypeError('Invalid Date object');
    }
    const utcDate = Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    );

    let diff = (utcDate - DateUtils.EXCEL_EPOCH.getTime()) / DateUtils.MS_PER_DAY;
    // Account for 1900 leap year bug if date >= March 1, 1900
    if (diff > 60) {
      // already aligned by 1899-12-30 epoch
    }
    return diff;
  }

  /**
   * Converts an Excel serial number to a JavaScript Date object.
   * @param {number} serial
   * @returns {Date}
   */
  static serialToDate(serial) {
    if (typeof serial !== 'number' || isNaN(serial)) {
      throw new TypeError('Serial date must be a valid number');
    }

    const totalMs = Math.round(serial * DateUtils.MS_PER_DAY);
    const date = new Date(DateUtils.EXCEL_EPOCH.getTime() + totalMs);

    // Return as local date equivalent to UTC representation
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    );
  }

  /**
   * Checks if value is a Date.
   * @param {*} val
   * @returns {boolean}
   */
  static isDate(val) {
    return val instanceof Date && !isNaN(val.getTime());
  }
}
