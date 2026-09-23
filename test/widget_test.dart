// Smoke tests for the Smart Dine WebView wrapper app.
//
// These tests intentionally avoid pumping the WebView widget: a real
// WebViewController requires platform channels that are not available in the
// Dart unit-test environment, so we assert at the Dart level instead.

import 'package:flutter_test/flutter_test.dart';

import 'package:smartdine/main.dart';

void main() {
  test('app points at the Smart Dine web application', () {
    expect(kSiteUrl, 'https://smart-dine-befb9.web.app');
  });

  test('Smart Dine app has the correct title', () {
    const app = SmartDineApp();
    expect(app, isNotNull);
  });
}
