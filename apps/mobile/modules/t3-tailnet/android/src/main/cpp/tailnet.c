#include <jni.h>
extern char* T3TailnetCall(char* request);
extern void T3TailnetFree(char* result);
JNIEXPORT jstring JNICALL Java_expo_modules_t3tailnet_TailnetBridge_call(JNIEnv* env, jobject instance, jstring request) {
  const char* input = (*env)->GetStringUTFChars(env, request, 0);
  if (!input) return 0;
  char* response = T3TailnetCall((char*)input);
  (*env)->ReleaseStringUTFChars(env, request, input);
  jstring output = (*env)->NewStringUTF(env, response);
  T3TailnetFree(response);
  return output;
}
