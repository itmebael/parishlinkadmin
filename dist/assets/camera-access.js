export function assertCameraAccess(context = globalThis) {
  if (!context.isSecureContext) throw new Error('Camera access requires HTTPS. Open the secure deployed website and try again.');
  const policy = context.document?.permissionsPolicy || context.document?.featurePolicy;
  if (policy?.allowsFeature && !policy.allowsFeature('camera')) {
    throw new Error('Camera access is blocked by the page hosting this app. Open the website directly in a browser tab and try again.');
  }
  if (!context.navigator?.mediaDevices?.getUserMedia) throw new Error('Camera capture is unavailable in this browser. Open the website in Chrome, Edge, or Safari.');
}
export function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission is blocked. In your browser?s site settings, set Camera to Allow, reload this page, and try again. Also allow this browser to use the camera in your device settings.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found. Connect or enable a camera, then try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera could not start. Close other apps using it and check your device?s camera settings, then try again.';
    default:
      return error?.message || 'Could not open the camera. Please try again.';
  }
}
