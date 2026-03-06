package com.muse.sync;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

public class ConnectActivity extends AppCompatActivity {

    private EditText ipInput;
    private EditText pinInput;
    private Button connectButton;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(0xFF2E3440);
        window.setNavigationBarColor(0xFF2E3440);

        setContentView(R.layout.activity_connect);

        ipInput = findViewById(R.id.ipInput);
        pinInput = findViewById(R.id.pinInput);
        connectButton = findViewById(R.id.connectButton);
        statusText = findViewById(R.id.statusText);

        // Pre-fill with last known URL and PIN
        SharedPreferences prefs = getSharedPreferences("muse_prefs", MODE_PRIVATE);
        String lastUrl = prefs.getString("server_url", "");
        String lastPin = prefs.getString("sync_pin", "");
        if (!lastUrl.isEmpty()) {
            String ip = lastUrl.replace("http://", "").replace(":3456", "");
            ipInput.setText(ip);
        }
        if (!lastPin.isEmpty()) {
            pinInput.setText(lastPin);
        }

        connectButton.setOnClickListener(v -> attemptConnect());

        // Allow enter key on PIN to connect
        pinInput.setOnEditorActionListener((v, actionId, event) -> {
            attemptConnect();
            return true;
        });
    }

    private void attemptConnect() {
        String ip = ipInput.getText().toString().trim();
        String pin = pinInput.getText().toString().trim();
        if (ip.isEmpty()) {
            statusText.setText("Enter your laptop's IP address");
            return;
        }
        if (pin.isEmpty() || pin.length() != 4) {
            statusText.setText("Enter the 4-digit PIN from Settings → Device Sync");
            return;
        }

        String url = "http://" + ip + ":3456";
        statusText.setText("Connecting to " + url + "...");
        connectButton.setEnabled(false);

        // Test connection + verify PIN in background
        new Thread(() -> {
            boolean ok = false;
            boolean authFailed = false;
            try {
                // First verify PIN via /api/auth
                HttpURLConnection conn = (HttpURLConnection) new URL(url + "/api/auth").openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                byte[] body = ("{\"pin\":\"" + pin + "\"}").getBytes("UTF-8");
                conn.getOutputStream().write(body);
                int code = conn.getResponseCode();
                if (code == 200) {
                    // Read response to check ok field
                    java.io.InputStream is = conn.getInputStream();
                    byte[] buf = new byte[1024];
                    int len = is.read(buf);
                    String resp = new String(buf, 0, len, "UTF-8");
                    ok = resp.contains("\"ok\":true");
                    if (!ok) authFailed = true;
                } else {
                    authFailed = true;
                }
                conn.disconnect();
            } catch (IOException e) {
                // Connection failed
            }

            boolean finalOk = ok;
            boolean finalAuthFailed = authFailed;
            runOnUiThread(() -> {
                connectButton.setEnabled(true);
                if (finalOk) {
                    // Save URL and PIN, then launch
                    SharedPreferences prefs = getSharedPreferences("muse_prefs", MODE_PRIVATE);
                    prefs.edit()
                        .putString("server_url", url)
                        .putString("sync_pin", pin)
                        .apply();

                    startActivity(new Intent(ConnectActivity.this, MainActivity.class));
                    finish();
                } else if (finalAuthFailed) {
                    statusText.setText("Wrong PIN. Check Settings → Device Sync in the desktop app for the correct PIN.");
                } else {
                    statusText.setText("Could not reach Muse at " + url + "\n\nMake sure:\n• Muse is running on your laptop\n• Both devices are on the same WiFi\n• The IP address is correct\n\n(Check Settings → Device Sync in the desktop app)");
                }
            });
        }).start();
    }
}
