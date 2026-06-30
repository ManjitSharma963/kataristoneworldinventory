import React from 'react';
import { Calendar } from 'primereact/calendar';
import {
  isoToDate,
  dateToIso,
  localIsoToDate,
  dateTimeToLocalIso,
} from '../utils/dateFormat';

/**
 * Date (or datetime) picker that always displays dd/mm/yy.
 * Value/onChange use yyyy-mm-dd strings, or yyyy-mm-ddTHH:mm when showTime is true.
 */
export default function DdMmYyCalendar({
  value,
  onChange,
  showTime = false,
  className,
  inputClassName,
  style,
  disabled,
  id,
  inputId,
  minDate,
  maxDate,
  placeholder = 'dd/mm/yy',
  showButtonBar = true,
  ...rest
}) {
  const parsedMin = typeof minDate === 'string' ? isoToDate(minDate) : minDate;
  const parsedMax = typeof maxDate === 'string' ? isoToDate(maxDate) : maxDate;
  const dateValue = showTime ? localIsoToDate(value) : isoToDate(value);

  return (
    <Calendar
      id={id}
      inputId={inputId}
      value={dateValue}
      onChange={(e) => {
        const next = e.value;
        if (showTime) {
          onChange?.(next ? dateTimeToLocalIso(next) : '');
        } else {
          onChange?.(next ? dateToIso(next) : '');
        }
      }}
      dateFormat="dd/mm/yy"
      placeholder={placeholder}
      showIcon
      showButtonBar={showButtonBar}
      showTime={showTime}
      hourFormat="24"
      className={className}
      inputClassName={inputClassName}
      style={style}
      disabled={disabled}
      minDate={parsedMin || undefined}
      maxDate={parsedMax || undefined}
      {...rest}
    />
  );
}
