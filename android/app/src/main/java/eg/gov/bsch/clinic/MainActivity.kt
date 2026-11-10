package eg.gov.bsch.clinic

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserRequestCode = 8142
    private val trustedHost = "bsch-clinic.com"
    private val homeUrl = "https://bsch-clinic.com/"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(8, 127, 120)
        window.navigationBarColor = Color.rgb(22, 60, 58)

        webView = WebView(this)
        webView.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        webView.setBackgroundColor(Color.WHITE)
        configureWebView()
        setContentView(webView)

        val restored = savedInstanceState?.let { webView.restoreState(it) }
        if (restored == null) webView.loadUrl(homeUrl)
    }

    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return true
                val scheme = uri.scheme?.lowercase() ?: return true
                val host = uri.host?.lowercase()

                if (scheme == "https" && (host == trustedHost || host == "www.$trustedHost")) {
                    return false
                }

                return openExternal(uri)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?,
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback

                val chooserIntent = try {
                    params?.createIntent() ?: Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                } catch (_: Exception) {
                    Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                }
                chooserIntent.addCategory(Intent.CATEGORY_OPENABLE)
                chooserIntent.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "application/pdf"))

                return try {
                    startActivityForResult(Intent.createChooser(chooserIntent, "اختر صورة أو ملفًا"), fileChooserRequestCode)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    Toast.makeText(this@MainActivity, "لا يوجد تطبيق لاختيار الملفات على هذا الجهاز.", Toast.LENGTH_LONG).show()
                    false
                }
            }
        }
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "لا يوجد تطبيق مناسب لفتح هذا الرابط.", Toast.LENGTH_SHORT).show()
            true
        } catch (_: Exception) {
            true
        }
    }

    @Deprecated("The WebView file chooser callback uses the legacy Activity result contract.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != fileChooserRequestCode) return
        val callback = fileChooserCallback ?: return
        fileChooserCallback = null
        val results = if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
        callback.onReceiveValue(results)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Use the system back gesture; this override preserves expected WebView history behavior.")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        if (::webView.isInitialized) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
