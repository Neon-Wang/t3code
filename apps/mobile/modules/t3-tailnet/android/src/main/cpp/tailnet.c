#include <jni.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
extern char* T3TailnetCall(char* request);
extern void T3TailnetFree(char* result);
extern void T3TailnetSetProxyResolver(void* resolver);
static JavaVM* vm;
static jclass bridge;
static jmethodID proxy_method;
static pthread_mutex_t init_lock = PTHREAD_MUTEX_INITIALIZER;
JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* java_vm, void* reserved) {
  vm = java_vm;
  return JNI_VERSION_1_6;
}
// Called by Go HTTP transports on arbitrary worker threads. Keep only the
// JavaVM and a global class reference; a JNIEnv belongs to one thread.
static char* system_proxy(const char* url) {
  JNIEnv* env = NULL;
  int attached = 0;
  if ((*vm)->GetEnv(vm, (void**)&env, JNI_VERSION_1_6) == JNI_EDETACHED) {
    if ((*vm)->AttachCurrentThread(vm, &env, NULL) != JNI_OK) return NULL;
    attached = 1;
  }
  if (!env) return NULL;
  jstring input = (*env)->NewStringUTF(env, url);
  jstring result = input ? (*env)->CallStaticObjectMethod(env, bridge, proxy_method, input) : NULL;
  char* output = NULL;
  if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
  else if (result) {
    const char* text = (*env)->GetStringUTFChars(env, result, NULL);
    if (text) { output = strdup(text); (*env)->ReleaseStringUTFChars(env, result, text); }
  }
  if (result) (*env)->DeleteLocalRef(env, result);
  if (input) (*env)->DeleteLocalRef(env, input);
  if (attached) (*vm)->DetachCurrentThread(vm);
  return output;
}
JNIEXPORT jstring JNICALL Java_expo_modules_t3tailnet_TailnetBridge_call(JNIEnv* env, jobject instance, jstring request) {
  pthread_mutex_lock(&init_lock);
  if (!bridge) {
    jclass local = (*env)->GetObjectClass(env, instance);
    jmethodID method = (*env)->GetStaticMethodID(env, local, "systemProxy", "(Ljava/lang/String;)Ljava/lang/String;");
    if (method) {
      bridge = (*env)->NewGlobalRef(env, local);
      proxy_method = method;
      if (bridge) T3TailnetSetProxyResolver((void*)system_proxy);
    }
    (*env)->DeleteLocalRef(env, local);
  }
  pthread_mutex_unlock(&init_lock);
  if ((*env)->ExceptionCheck(env)) return NULL;
  const char* input = (*env)->GetStringUTFChars(env, request, 0);
  if (!input) return 0;
  char* response = T3TailnetCall((char*)input);
  (*env)->ReleaseStringUTFChars(env, request, input);
  jstring output = (*env)->NewStringUTF(env, response);
  T3TailnetFree(response);
  return output;
}
