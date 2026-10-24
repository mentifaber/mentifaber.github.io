plugins { id("com.android.application") }

// The release key comes from the build machine (decrypted from android/release.jks.enc with the AUTOFABER_KEY_PASSPHRASE secret);
// without it the build is signed with a throwaway debug key, which installs fine but can't update a release-signed copy.
val keyFile = System.getenv("AF_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }
val keyPass = System.getenv("AF_KEY_PASS") ?: ""
val run = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "org.mentifaber.autofaber"
    compileSdk = 34
    defaultConfig {
        applicationId = "org.mentifaber.autofaber"
        minSdk = 21
        targetSdk = 34
        versionCode = 100 + run
        versionName = "1.0.$run"
    }
    signingConfigs {
        if (keyFile != null) create("release") { storeFile = keyFile; storePassword = keyPass; keyAlias = "autofaber"; keyPassword = keyPass }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = if (keyFile != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies { implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0") }
