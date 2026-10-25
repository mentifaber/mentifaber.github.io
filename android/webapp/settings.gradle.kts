// One Android app for each of Mentifaber's web apps: a Trusted Web Activity around mentifaber.org/<app>, built once per
// app by .github/workflows/android.yml with that app's id, name, address, colour and logo from android/apps.json ("twa").
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "MentifaberWebApp"
include(":app")
