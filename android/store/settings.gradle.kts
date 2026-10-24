// Mentifaber Store for Android: installs and updates the apps in android/apps.json; built and signed by .github/workflows/android.yml
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "MentifaberStore"
include(":app")
