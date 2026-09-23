import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'webview/app_webview.dart';

/// The existing, independently-hosted Smart Dine web application. The Flutter
/// app is ONLY a WebView wrapper around this URL — it does not re-implement any
/// of the React application's UI or logic.
const String kSiteUrl = 'https://smart-dine-befb9.web.app';

void main() {
  runApp(const SmartDineApp());
}

class SmartDineApp extends StatelessWidget {
  const SmartDineApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Smart Dine',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFDD2C00)),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

enum LoadState {
  loading,
  ready,
  error,
  offline,
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  AppWebViewController? _controller;
  LoadState _loadState = LoadState.loading;
  bool _pinLoading = false;
  bool _exitDialogOpen = false;
  // Used to force-recreate AppWebView when retry is called before controller is ready.
  int _webViewKey = 0;
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;

  @override
  void initState() {
    super.initState();

    _connectivitySub =
        _connectivity.onConnectivityChanged.listen((List<ConnectivityResult> results) {
      final bool online = results.any((r) => r != ConnectivityResult.none);
      if (mounted && !online && _loadState != LoadState.offline) {
        setState(() => _loadState = LoadState.offline);
      } else if (mounted && online && _loadState == LoadState.offline) {
        _retry();
      }
    });
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    super.dispose();
  }

  void _onControllerCreated(AppWebViewController controller) {
    _controller = controller;
  }

  void _onPageStarted(String url) {
    if (mounted && !_pinLoading) {
      setState(() => _loadState = LoadState.loading);
    }
  }

  void _onPageFinished(String url) {
    if (mounted) {
      setState(() {
        _loadState = LoadState.ready;
        _pinLoading = false;
      });
    }
  }

  void _onWebResourceError(String message) {
    if (mounted) {
      setState(() {
        _loadState = LoadState.error;
        _pinLoading = false;
      });
    }
  }

  void _retry() {
    setState(() {
      _loadState = LoadState.loading;
      _pinLoading = true;
      if (_controller != null) {
        _controller!.loadUrl(kSiteUrl);
      } else {
        // Controller not yet ready (race between initState and first frame).
        // Force recreation of AppWebView which will load the URL in its initState.
        _webViewKey++;
      }
    });
  }

  Future<void> _handleBack() async {
    bool canGoBack = false;
    try {
      canGoBack = await _controller?.canGoBack() ?? false;
    } catch (_) {
      canGoBack = false;
    }
    if (canGoBack) {
      try {
        await _controller?.goBack();
      } catch (_) {}
      return;
    }

    if (_exitDialogOpen) return;
    if (!mounted) return;
    _exitDialogOpen = true;
    final bool? exit = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Exit Smart Dine?'),
        content: const Text('Are you sure you want to close the app?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Stay'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Exit'),
          ),
        ],
      ),
    );
    _exitDialogOpen = false;
    if (exit == true) {
      if (kIsWeb) {
        // On web there is no SystemNavigator.pop; just close dialog.
        // Optionally could navigate back in browser history.
        return;
      }
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) async {
        if (didPop) return;
        await _handleBack();
      },
      child: Scaffold(
        body: Stack(
          fit: StackFit.expand,
          children: [
            AppWebView(
              key: ValueKey<int>(_webViewKey),
              url: kSiteUrl,
              onControllerCreated: _onControllerCreated,
              onPageStarted: _onPageStarted,
              onPageFinished: _onPageFinished,
              onWebResourceError: _onWebResourceError,
            ),
            if (_loadState == LoadState.loading) const _LoadingScreen(),
            if (_loadState == LoadState.error)
              _ErrorScreen(
                offline: false,
                onRetry: _retry,
              ),
            if (_loadState == LoadState.offline)
              _ErrorScreen(
                offline: true,
                onRetry: _retry,
              ),
          ],
        ),
      ),
    );
  }
}

/// Simple branded loading / splash overlay shown while the website loads.
class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFFF7F7F7),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFDD2C00),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.restaurant, color: Colors.white, size: 44),
            ),
            const SizedBox(height: 20),
            const Text(
              'Smart Dine',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: Color(0xFF333333),
              ),
            ),
            const SizedBox(height: 24),
            const SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(strokeWidth: 3),
            ),
          ],
        ),
      ),
    );
  }
}

/// User-friendly screen shown when there is no connection or the site cannot
/// be loaded. Never exposes raw WebView/technical errors to the user.
class _ErrorScreen extends StatelessWidget {
  const _ErrorScreen({required this.offline, required this.onRetry});

  final bool offline;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFFF7F7F7),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 84,
                height: 84,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFFDD2C00),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.restaurant, color: Colors.white, size: 44),
              ),
              const SizedBox(height: 24),
              const Text(
                'Smart Dine',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF333333),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                offline
                    ? 'Unable to connect to Smart Dine.\nPlease check your internet connection.'
                    : 'Unable to load Smart Dine.\nPlease try again.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 15, color: Color(0xFF666666), height: 1.5),
              ),
              const SizedBox(height: 28),
              FilledButton.icon(
                onPressed: onRetry,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFDD2C00),
                  minimumSize: const Size(180, 48),
                ),
                icon: const Icon(Icons.refresh),
                label: const Text('Retry', style: TextStyle(fontSize: 16)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
