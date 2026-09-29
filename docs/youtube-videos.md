# Asset and Lot Listing video links

Videos remain originals in R2 and the existing report media ZIP. The optional
backend YouTube integration is configured through the admin application, not
through appraiser credentials or browser uploads to Google. See the backend's
`docs/youtube-connection.md` for Google setup, publication and retry safeguards.

Web Asset mixed lots send a `video_count` for every lot, including zero, and the
direct manifest maps each clip to its source `lotIndex`. Existing Lot Listing
and native mappings are unchanged. Explicit malformed/inconsistent counts fail
before upload. Legacy callers without counts remain unassigned rather than
guessing which lot owns a video.

Uploading media or saving a draft does not upload to YouTube. Once configured,
explicit reviewed preview submission prepares private clips; existing approval
and release rules govern public visibility. Excel's appended **YouTube Video
URL** column uses backend-confirmed links. Multiple URLs use separate lines in
one cell, with the first hyperlinked. PDF/DOCX layouts and all existing import
column positions remain unchanged. No direct Auctioneer API video field is added.

Backend/workers must be updated before admin/web. Existing mobile transport
works without a new binary. No historical upload, production mutation, new
package, deployment or push is implied by this change.
