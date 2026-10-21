// Pure booking display adapter shared by the admin browser and server.
// This reads existing saved shapes; it does not import records or fetch media.
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = value => Array.isArray(value) ? value : [];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function readBookingSubmission(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function photo(value) {
  const source = typeof value === 'string' ? value : object(value).uri;
  if (typeof source !== 'string' || !source.trim()) return { unavailable: 'Photo unavailable: no supported image was saved.' };
  if (/^(?:file|content|blob):/i.test(source)) return { unavailable: 'Photo unavailable: this image is stored only on the original device and has not been uploaded.' };
  if (source.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) return { unavailable: 'Photo unavailable: the saved image exceeds the 5 MB display limit.' };
  const match = /^data:image\/(png|jpeg|webp);base64,/.exec(source);
  const encoded = match ? source.slice(match[0].length) : '';
  if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return { unavailable: 'Photo unavailable: only saved PNG, JPEG or WebP image data can be displayed. Shared photo storage is not connected.' };
  const size = encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (size > MAX_IMAGE_BYTES) return { unavailable: 'Photo unavailable: the saved image exceeds the 5 MB display limit.' };
  let bytes;
  try { bytes = atob(encoded); } catch { return { unavailable: 'Photo unavailable: the saved image data is invalid.' }; }
  const has = (offset, values) => values.every((value, index) => bytes.charCodeAt(offset + index) === value);
  const valid = match[1] === 'png' ? has(0, [137,80,78,71,13,10,26,10])
    : match[1] === 'jpeg' ? has(0, [255,216,255])
    : has(0, [82,73,70,70]) && has(8, [87,69,66,80]);
  return valid ? { src: source } : { unavailable: 'Photo unavailable: the saved file does not match its image format.' };
}

function privatePhoto(value, bookingId) {
  const row = object(value);
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.id) || typeof bookingId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(bookingId)) return null;
  const suffix = `bookings/${encodeURIComponent(bookingId)}/photos/${encodeURIComponent(row.id)}`;
  const expected = [`/api/member/${suffix}`, `/api/${suffix}`];
  return expected.includes(row.url) ? { src: row.url } : { unavailable: 'Photo unavailable: the saved private photo reference is invalid.' };
}
function groupsFor(submission, sharedPhotos, bookingId) {
  const nestedBooking = object(submission.booking);
  const intake = object(submission.intake || nestedBooking.intake);
  const rawIntake = Array.isArray(submission.fields);
  // A StaffCompletedJob uses top-level photos for completion; a raw intake uses
  // the same key for the student's request. Preserve that distinction.
  const request = [...list(intake.photos), ...list(submission.images), ...(rawIntake ? list(submission.photos) : [])];
  const before = list(submission.beforePhotos);
  const completion = [...list(submission.completionPhotos), ...(!rawIntake ? list(submission.photos) : [])];
  return [
    { key: 'request', label: 'Request photos', values: request },
    { key: 'before', label: 'Before-service photos', values: before },
    { key: 'completion', label: 'Completion photos', values: completion },
  ].map(({ key, label, values }) => ({
    key, label, photos: [...values.map(photo), ...list(sharedPhotos).filter(item => object(item).group === key).map(item => privatePhoto(item, bookingId)).filter(Boolean)],
  }));
}

const labels = {
  service: 'Service', date: 'Date', bookingDate: 'Date', booking_date: 'Date',
  time: 'Time', bookingTime: 'Time', booking_time: 'Time',
  location: 'Address / route', place: 'Address / route', bookingAddress: 'Address / route', booking_address: 'Address / route',
  description: 'Booking details', details: 'Booking details', detail: 'Booking details', summary: 'Booking details',
  dropoffEta: 'Estimated drop-off time', total: 'Estimated total', dueNow: 'Deposit due', note: 'Payment information',
  special_instructions: 'Special instructions', instructions: 'Special instructions',
  event_name: 'Event', event_date: 'Event date', start_time: 'Start time', end_time: 'End time',
  capacity: 'Capacity', ticket_price: 'Ticket price', source: 'Record source', image_status: 'Photo information',
};
const hiddenFields = new Set(['images','photos','beforePhotos','completionPhotos','intake','booking','fields']);
const serviceName = value => ({ cleaning: 'Cleaning', moving: 'Moving', airport: 'Airport transfer', airport_transfer: 'Airport transfer' })[value] || value;

export function normalizeBookingDetails(input) {
  const row = object(input), submission = readBookingSubmission(row.submission) || {};
  const booking = object(submission.booking), intake = object(submission.intake || booking.intake);
  const fields = [], known = new Set();
  const add = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    if (!['string','number','boolean'].includes(typeof value)) return;
    const text = String(value), key = label + '\0' + text;
    if (!known.has(key)) { fields.push({ label, value: text }); known.add(key); }
  };
  add('Booking reference', row.id || booking.id);
  add('Service', serviceName(row.service || submission.service));
  add('Customer', row.customer || booking.student || submission.student);
  add('Status', typeof row.status === 'string' ? row.status.replaceAll('_',' ').replaceAll('-',' ') : row.status);
  if (row.pricingStatus === 'unquoted') add('Booking amount', 'Awaiting quote');
  else if (Number.isSafeInteger(row.amount_pence)) add('Booking amount', new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(row.amount_pence / 100));
  add('Created', row.created_at);
  const assignment = object(row.assignment);
  add('Assigned staff', assignment.name);
  add('Scheduled start', assignment.starts_at);
  add('Scheduled end', assignment.ends_at);
  const append = values => {
    for (const [key, value] of Object.entries(values)) {
      if (hiddenFields.has(key) || ['id','student','status','title','service'].includes(key)) continue;
      const label = labels[key] || key.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2');
      if (Array.isArray(value)) { if (value.every(item => ['string','number','boolean'].includes(typeof item))) add(label, value.join('\n')); }
      else add(label, value);
    }
  };
  append(booking); append(submission);
  for (const field of [...list(intake.fields), ...list(submission.fields)]) {
    if (typeof object(field).label === 'string') add(field.label, field.value);
  }
  return { fields, photoGroups: groupsFor(submission, row.photos, row.id) };
}

