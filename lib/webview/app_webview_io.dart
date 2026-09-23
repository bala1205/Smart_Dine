import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Abstraction used by [HomePage] so that web never touches
/// WebViewPlatform.instance.
abstract class AppWebViewController {
  Future<bool> canGoBack();
  Future<void> goBack();
  Future<void> loadUrl(String url);
}

class _IoAppWebViewController implements AppWebViewController {
  final WebViewController _controller;
  _IoAppWebViewController(this._controller);

  @override
  Future<bool> canGoBack() => _controller.canGoBack();

  @override
  Future<void> goBack() => _controller.goBack();

  @override
  Future<void> loadUrl(String url) => _controller.loadRequest(Uri.parse(url));
}

/// Mobile implementation – thin wrapper around webview_flutter.
/// This file is ONLY compiled when dart:io is available, so it is never
/// included in the Flutter Web build.
class AppWebView extends StatefulWidget {
  final String url;
  final void Function(String url)? onPageStarted;
  final void Function(String url)? onPageFinished;
  final void Function(String message)? onWebResourceError;
  final void Function(AppWebViewController controller)? onControllerCreated;

  const AppWebView({
    super.key,
    required this.url,
    this.onPageStarted,
    this.onPageFinished,
    this.onWebResourceError,
    this.onControllerCreated,
  });

  @override
  State<AppWebView> createState() => _AppWebViewState();
}

class _AppWebViewState extends State<AppWebView> {
  late final WebViewController _webController;
  late final _IoAppWebViewController _appController;

  @override
  void initState() {
    super.initState();
    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF7F7F7))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) => widget.onPageStarted?.call(url),
          onPageFinished: (String url) => widget.onPageFinished?.call(url),
          onWebResourceError: (WebResourceError error) {
            if (error.isForMainFrame != true) return;
            widget.onWebResourceError?.call(error.description);
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));

    _appController = _IoAppWebViewController(_webController);
    // Notify parent after first frame to avoid setState during build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onControllerCreated?.call(_appController);
    });
  }

  @override
  void didUpdateWidget(covariant AppWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _webController.loadRequest(Uri.parse(widget.url));
    }
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _webController);
  }
}
