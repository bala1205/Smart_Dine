// Platform-aware barrel file.
// On mobile/desktop (dart:io available) -> app_webview_io.dart (webview_flutter)
// On web (dart:io unavailable) -> app_webview_web.dart (iframe)
export 'app_webview_web.dart' if (dart.library.io) 'app_webview_io.dart';
