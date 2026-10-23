# Larger photo uploads

Customer and admin photo uploads now support 10 MB per photo across restaurant previews, menus, reviews, marketplace, event photos, booking evidence and chat attachments. Profile uploads retain their existing 20 MB input allowance with automatic resizing. Restaurant menu inputs no longer force camera capture, allowing photo-library selection. Menu/review batches are capped at 30 MB total.

Updated both upload validation and private image display limits, translated hints, server request limits and compiled website. Existing authentication, permissions and format validation remain enforced.

Validation: 50 backend checks including 10 MB HTTP save/download and one-byte-over rejection; 28 frontend checks; TypeScript and production export.
