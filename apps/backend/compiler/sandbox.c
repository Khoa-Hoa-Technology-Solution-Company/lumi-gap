#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <seccomp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <unistd.h>
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif

/* This executable fails closed: TeX never runs without filesystem and network isolation. */
static void fail(const char *message) { perror(message); exit(125); }
static void allow_path(int rules, const char *path, uint64_t access) {
    int fd = open(path, O_PATH | O_CLOEXEC);
    if (fd < 0) { if (errno == ENOENT) return; fail("sandbox path"); }
    struct landlock_path_beneath_attr rule = { .allowed_access = access, .parent_fd = fd };
    if (syscall(SYS_landlock_add_rule, rules, LANDLOCK_RULE_PATH_BENEATH, &rule, 0)) fail("sandbox rule");
    close(fd);
}
int main(int argc, char **argv) {
    if (argc < 3) return 125;
    int abi = syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 1) { fprintf(stderr, "Landlock is required\n"); return 125; }
    uint64_t read = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR;
    uint64_t all = (1ULL << (abi >= 3 ? 15 : abi >= 2 ? 14 : 13)) - 1;
    struct landlock_ruleset_attr attr = { .handled_access_fs = all };
    int rules = syscall(SYS_landlock_create_ruleset, &attr, sizeof(attr), 0);
    if (rules < 0) fail("sandbox creation");
    const char *readonly[] = {"/usr", "/lib", "/lib64", "/etc/texmf", "/etc/fonts", "/var/lib/texmf", "/var/cache/fontconfig", NULL};
    for (int i = 0; readonly[i]; i++) allow_path(rules, readonly[i], read | LANDLOCK_ACCESS_FS_EXECUTE);
    /* libpaper 2 (Debian 13) resolves named formats through paperspecs. */
    allow_path(rules, "/etc/paperspecs", LANDLOCK_ACCESS_FS_READ_FILE);
    allow_path(rules, "/etc/papersize", LANDLOCK_ACCESS_FS_READ_FILE);
    allow_path(rules, "/dev/null", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE);
    allow_path(rules, "/dev/urandom", LANDLOCK_ACCESS_FS_READ_FILE);
    allow_path(rules, argv[1], all & (read | LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_REMOVE_FILE | LANDLOCK_ACCESS_FS_REMOVE_DIR | LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_DIR | LANDLOCK_ACCESS_FS_TRUNCATE | LANDLOCK_ACCESS_FS_REFER));
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) fail("sandbox privileges");
    if (syscall(SYS_landlock_restrict_self, rules, 0)) fail("sandbox enforcement");
    close(rules);
    scmp_filter_ctx filter = seccomp_init(SCMP_ACT_ALLOW);
    if (!filter) fail("seccomp init");
    /* truncate-by-path is blocked explicitly, including on ABI 1/2 kernels. */
    const char *deny[] = {"socket", "socketpair", "connect", "bind", "listen", "accept", "accept4", "ptrace", "process_vm_readv", "process_vm_writev", "kill", "tkill", "tgkill", "mount", "umount2", "unshare", "setns", "truncate", "truncate64", NULL};
    for (int i = 0; deny[i]; i++) {
        int number = seccomp_syscall_resolve_name(deny[i]);
        if (number != __NR_SCMP_ERROR && seccomp_rule_add(filter, SCMP_ACT_ERRNO(EPERM), number, 0)) fail("seccomp rule");
    }
    if (seccomp_load(filter)) fail("seccomp enforcement");
    seccomp_release(filter);
    struct rlimit cpu = {30, 30}, size = {20000000, 20000000}, memory = {512ULL*1024*1024,512ULL*1024*1024}, descriptors = {64,64}, processes = {16,16};
    if (setrlimit(RLIMIT_CPU, &cpu) || setrlimit(RLIMIT_FSIZE, &size) || setrlimit(RLIMIT_AS, &memory) || setrlimit(RLIMIT_NOFILE, &descriptors) || setrlimit(RLIMIT_NPROC, &processes)) fail("sandbox limits");
    execv(argv[2], argv + 2);
    fail("sandbox exec");
}
