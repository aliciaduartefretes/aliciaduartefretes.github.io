import { upload } from "@vercel/blob/client";

window.NALVI_UPLOAD_PRIVATE_BLOB = function uploadPrivateNalviBlob(pathname, file, options = {}) {
  return upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/premium-academy?operation=resource-upload",
    headers: options.headers || {},
    contentType: "application/pdf",
    multipart: true,
    onUploadProgress: options.onProgress
  });
};
