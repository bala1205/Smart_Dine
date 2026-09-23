// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:html' as html;
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';

/// Same abstraction as IO version, but implemented with an iframe.
/// This file is ONLY compiled for Flutter Web (when dart:io is unavailable),
/// so it never imports webview_flutter and never touches WebViewPlatform.instance.
abstract class AppWebViewController {
  Future<bool> canGoBack();
  Future<void> goBack();
  Future<void> loadUrl(String url);
}

class _WebAppWebViewController implements AppWebViewController {
  final html.IFrameElement _iframe;
  _WebAppWebViewController(this._iframe);

  @override
  Future<bool> canGoBack() async {
    try {
      // history.length is accessible even cross-origin on most browsers;
      // if >1 we can go back. If cross-origin blocks, return false.
      // Use dynamic to handle HistoryBase vs History type differences
      // across dart:html versions.
      final dynamic history = _iframe.contentWindow?.history;
      if (history != null) {
        // `length` may throw on cross-origin; handle gracefully.
        final dynamic len = history.length;
        if (len is int) return len > 1;
      }
    } catch (_) {}
    return false;
  }

  @override
  Future<void> goBack() async {
    try {
      final dynamic history = _iframe.contentWindow?.history;
      history?.back();
    } catch (_) {}
  }

  @override
  Future<void> loadUrl(String url) async {
    try {
      if (_iframe.src == url) {
        // Force reload when same URL (e.g. Retry).
        final dynamic loc = _iframe.contentWindow?.location;
        loc?.reload();
        // Fallback: re-assign src if reload blocked.
        if (_iframe.src != url) {
          _iframe.src = url;
        } else {
          // Ensure iframe still triggers load; reassign with cache-bust fallback
          // by briefly clearing then resetting if reload didn't fire.
          // Most browsers reload correctly, so we only re-assign when needed.
        }
      } else {
        _iframe.src = url;
      }
    } catch (_) {
      // If cross-origin blocks contentWindow access, just reassign src.
      _iframe.src = url;
    }
  }
}

/// Web implementation – displays the Smart Dine React site via iframe.
/// Uses HtmlElementView which is the web-compatible alternative to WebViewWidget.
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
  late final html.IFrameElement _iframe;
  late final _WebAppWebViewController _controller;
  late final String _viewType;

  @override
  void initState() {
    super.initState();
    _viewType = 'smart-dine-iframe-${identityHashCode(this)}';
    _iframe = html.IFrameElement()
      ..src = widget.url
      ..style.border = '0'
      ..style.width = '100%'
      ..style.height = '100%'
      ..allowFullscreen = true
      // Allow common permissions needed by the React app.
      ..allow = 'fullscreen; clipboard-write; autoplay; geolocation';

    // Register factory for this specific viewType. Each widget instance gets
    // a unique viewType to avoid duplicate registration errors on hot reload.
    ui_web.platformViewRegistry.registerViewFactory(
      _viewType,
      (int viewId) => _iframe,
    );

    _controller = _WebAppWebViewController(_iframe);

    // Defer callbacks to avoid setState during build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onControllerCreated?.call(_controller);
      widget.onPageStarted?.call(widget.url);
    });

    _iframe.onLoad.listen((_) {
      widget.onPageFinished?.call(widget.url);
    });

    _iframe.onError.listen((_) {
      widget.onWebResourceError?.call('Failed to load ${widget.url}');
    });
  }

  @override
  void didUpdateWidget(covariant AppWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _iframe.src = widget.url;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Stack allows the outer HomePage to overlay loading/error screens.
    // The iframe itself fills the available space.
    return HtmlElementView(viewType: _viewType);
  }
}
