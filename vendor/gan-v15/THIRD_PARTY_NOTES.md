# Third-party source notes

The executable baseline is an unchanged copy of the project at commit
29089ffb1647cede34af96a67ca38ca1f9af9d3f. Existing notices are retained.

- `dist/gan-driver.js`: vendored esm.sh bundle identifying itself as
  `gan-web-bluetooth@3.0.2`, with local recovery/AES export hooks.
  Upstream: https://github.com/afedotov/gan-web-bluetooth (MIT).
  Local changes include replacing the browser's process import with
  `const __Process$ = undefined`, exporting AES and protocol/cipher hooks,
  and a connectGanDevice entry point. Preserve this exact file if reusing
  its non-public/minified exports; replacing it with upstream's public
  package alone does not implement the custom legacy driver.
- Bundled `aes-js`: Richard Moore, MIT; bundled notice retained.
  https://github.com/ricmoo/aes-js
- Bundled reactive implementation is an upstream dependency; consult the
  matching upstream package's notices (RxJS uses Apache-2.0).
  https://github.com/ReactiveX/rxjs
- `dist/cube.js`: the project's vendored cubejs 1.3.2 UMD dependency.
  https://github.com/ldez/cubejs (MIT).
- The csTimer GAN driver was inspected as a protocol reference, especially
  its legacy packet layout and FFF6 timing reads. It is not shipped here
  as the project's driver. csTimer source has its own license:
  https://github.com/cs0x7f/cstimer

Original upstream licenses and dependency notices remain applicable to
redistribution. This handoff does not assign a new license to third-party
code or claim that every bundled dependency shares one license.

The sourceMappingURL comment in the bundle refers to a map not included
in this project. It is not an execution dependency of the connection code.
