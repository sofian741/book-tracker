package com.sufyan.booktracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContactPickerPlugin.class);
        super.onCreate(savedInstanceState);
        // Honor the phone's accessibility font setting in the local WebView.
        getBridge().getWebView().getSettings().setTextZoom(
            Math.round(getResources().getConfiguration().fontScale * 100)
        );
    }
}
