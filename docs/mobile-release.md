# Mobile release guide

Settle is a Capacitor app that bundles the production Vite build. It has no API endpoint, account system, remote database, analytics SDK, or runtime dependency on the hosted website.

## Prerequisites

- Node.js 22.12+ (Node 22 LTS recommended)
- Xcode 26+ for iOS
- Android SDK 36 and JDK 21 for Android
- A release keystore configured outside the repository for signed Android builds
- Apple signing access for the `com.xingfanxia.settle` bundle identifier for TestFlight

## Sync native projects

```bash
npm ci
npm run mobile:sync
```

`mobile:sync` type-checks and builds the web app before copying the generated `dist` assets into both native projects.

## Android APK

```bash
npm run mobile:android:apk
```

The signed sideload artifact is written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

The release build intentionally fails when signing is not configured. Create a gitignored `android/keystore.properties` with:

```properties
storeFile=/absolute/path/to/upload-keystore.jks
passwordFile=/absolute/path/to/password-file
keyAlias=your-alias
```

The same values can be provided through `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, and `ANDROID_KEY_ALIAS` in CI. Never commit the keystore or its password.

## iOS and TestFlight

Open the project with:

```bash
npm run mobile:ios
```

Use scheme `App`, Release configuration, bundle identifier `com.xingfanxia.settle`, marketing version `1.0`, and build number `1`. Archive against `generic/platform=iOS`, export with the `app-store-connect` method, upload the resulting IPA, and wait for App Store Connect processing before selecting the build in TestFlight.

Creating a new App Store Connect app record is a one-time web step. Uploading a build does not submit it to App Review or enable external testing.

## Icons and splash screens

The source artwork lives at `assets/logo.svg`. Regenerate each native platform explicitly so the asset tool does not emit unrelated PWA files:

```bash
npx @capacitor/assets@3.0.5 generate --ios --iconBackgroundColor '#10241b' --iconBackgroundColorDark '#10241b' --splashBackgroundColor '#f4f1e8' --splashBackgroundColorDark '#101511' --logoSplashTargetWidth 460
npx @capacitor/assets@3.0.5 generate --android --iconBackgroundColor '#10241b' --iconBackgroundColorDark '#10241b' --splashBackgroundColor '#f4f1e8' --splashBackgroundColorDark '#101511' --logoSplashTargetWidth 460
```

Run `npm run mobile:sync` again after regenerating assets.

## Local data behavior

Current entries and named history snapshots live in the native WebView's app-scoped storage. Reloading or force-closing the app preserves them. Clearing app data or uninstalling removes them. The Android manifest disables OS backup and contains no internet permission.
