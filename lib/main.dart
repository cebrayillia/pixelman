import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await _enforceImmersiveMode();
  runApp(const PixelShadowApp());
}

Future<void> _enforceImmersiveMode() async {
  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.immersiveSticky,
    overlays: [],
  );
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
}

class PixelShadowApp extends StatelessWidget {
  const PixelShadowApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gölge Piksel: Destan',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0A0A14),
      ),
      home: const GameWebViewScreen(),
    );
  }
}

class GameWebViewScreen extends StatefulWidget {
  const GameWebViewScreen({super.key});

  @override
  State<GameWebViewScreen> createState() => _GameWebViewScreenState();
}

class _GameWebViewScreenState extends State<GameWebViewScreen>
    with WidgetsBindingObserver {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _enforceImmersiveMode();

    SystemChrome.setSystemUIChangeCallback((systemOverlaysAreVisible) async {
      if (systemOverlaysAreVisible) {
        Future.delayed(const Duration(seconds: 2), _enforceImmersiveMode);
      }
    });

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0A14))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) => _enforceImmersiveMode(),
        ),
      )
      ..loadFlutterAsset('assets/index.html');
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _enforceImmersiveMode();
    } else if (state == AppLifecycleState.paused) {
      _controller.runJavaScript("if(window.autoPauseGame) window.autoPauseGame();");
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          _controller.runJavaScript("if(window.handleBackButton) window.handleBackButton();");
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0A0A14),
        resizeToAvoidBottomInset: false,
        body: SizedBox.expand(
          child: WebViewWidget(controller: _controller),
        ),
      ),
    );
  }
}
