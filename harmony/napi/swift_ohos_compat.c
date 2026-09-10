#include <errno.h>
#include <spawn.h>

extern char *__progname;
__attribute__((visibility("hidden"))) char *program_invocation_short_name;
__attribute__((constructor)) static void t3_set_program_name(void) {
  program_invocation_short_name = __progname;
}

// Foundation links Process support, but no T3 native module launches a local
// process. OHOS lacks the working-directory file action; report unsupported.
__attribute__((visibility("hidden")))
int posix_spawn_file_actions_addchdir_np(posix_spawn_file_actions_t *actions, const char *path) {
  (void)actions;
  (void)path;
  return ENOSYS;
}
