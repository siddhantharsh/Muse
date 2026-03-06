package com.muse.sync;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private FrameLayout errorView;
    private TextView errorText;
    private String serverUrl;
    private String syncPin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge dark theme
        Window window = getWindow();
        window.setStatusBarColor(0xFF2E3440);
        window.setNavigationBarColor(0xFF2E3440);

        SharedPreferences prefs = getSharedPreferences("muse_prefs", MODE_PRIVATE);
        serverUrl = prefs.getString("server_url", null);
        syncPin = prefs.getString("sync_pin", "");

        if (serverUrl == null || serverUrl.isEmpty()) {
            // First launch — show connection screen
            startActivity(new Intent(this, ConnectActivity.class));
            finish();
            return;
        }

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        errorView = findViewById(R.id.errorView);
        errorText = findViewById(R.id.errorText);

        setupWebView();
        webView.loadUrl(serverUrl);
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.setBackgroundColor(0xFF2E3440);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showError("Can't reach Muse on your laptop.\nMake sure both devices are on the same WiFi and Muse is running.\n\nTap to retry.");
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Keep everything in the WebView
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideError();
                // Inject PIN into localStorage so the web app can authenticate
                if (syncPin != null && !syncPin.isEmpty()) {
                    view.evaluateJavascript(
                        "localStorage.setItem('muse_sync_pin', '" + syncPin + "');",
                        null
                    );
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // Tap error to retry
        errorView.setOnClickListener(v -> {
            hideError();
            webView.loadUrl(serverUrl);
        });
    }

    private void showError(String message) {
        errorText.setText(message);
        errorView.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);
    }

    private void hideError() {
        errorView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
