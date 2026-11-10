import java.io.File
import java.util.Base64

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystoreBase64 = System.getenv("ANDROID_KEYSTORE_BASE64")
val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val keyAlias = System.getenv("ANDROID_KEY_ALIAS")
val keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
val releaseSigningConfigured = listOf(keystoreBase64, keystorePassword, keyAlias, keyPassword).all { !it.isNullOrBlank() }
val releaseKeystore = if (releaseSigningConfigured) {
    File(layout.buildDirectory.get().asFile, "upload-key.jks").apply {
        parentFile.mkdirs()
        writeBytes(Base64.getDecoder().decode(keystoreBase64))
    }
} else null

android {
    namespace = "com.bschclinic.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.bschclinic.app"
        minSdk = 23
        targetSdk = 36
        versionCode = providers.gradleProperty("VERSION_CODE").map { it.toInt() }.getOrElse(1)
        versionName = providers.gradleProperty("VERSION_NAME").orElse("1.0.0").get()
        manifestPlaceholders["appName"] = providers.gradleProperty("APP_NAME")
            .orElse("عيادات مستشفى الأطفال التخصصي")
            .get()
    }

    if (releaseKeystore != null) {
        signingConfigs {
            create("release") {
                storeFile = releaseKeystore
                storePassword = keystorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            if (releaseKeystore != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = false
    }
}
