// SPA deep-link fallback (plan E.2.2, H.4.2). cloudfront-js-2.0, viewer-request, default behaviour only.
// A path whose last segment has no file extension, and that is not under /api/, is served as /index.html.
// Files (/assets/x.js, /missing.js) keep their real status; the query string is a separate field and is untouched.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (uri.indexOf('/api/') !== 0 && lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
