# Fifones City — provenance

Base: https://github.com/hexianWeb/CubeCity
Branch: big-simcity
Revision adopted: 0191f5170872382954c15b7316f2e34d020d6d49
Retrieved: 2026-11-03

The original MIT LICENSE is preserved. The city adaptation reuses CubeCity code,
including SimObject and its picking utilities, and preserves attribution and the adopted upstream revision
for traceability. The Fifones interface, real-activity rewards and local API
are additions; this is not a copy of a proprietary commercial game.

## Assets used by the adaptation

- GLB landmarks: copied from the user's existing Fifones installation, supplied
  by the user in earlier work. These are personal project assets. Third-party
  logos remain the marks of their owners. No redistribution rights are inferred.
- Scene terrain, sea, hills, bridge and starter buildings: generated in code.
- Fonts: Figtree and Newsreader, SIL Open Font License; full notices in
  public-fifones/fonts/licenses and delivered with the app.
- Unused upstream model/audio packs are omitted from this public snapshot.
  No claim is made about their rights.

No upstream postinstall, Git hooks, global tools, telemetry or deployment was run.



## Nova interface pessoal — 3 de novembro de 2026

Referência de produto confirmada pelo usuário: Néctar brasileiro de organização
pessoal, https://meu-nectar.app/ e https://apps.apple.com/br/app/n%C3%A9ctar/id6748546755.
Design e código da interface pessoal foram criados neste projeto. Não foram
copiados código, marca, imagens de divulgação ou dados do Néctar.
A cidade CubeCity permanece em `src/CityApp.vue` e `city.html`; o novo shell
pessoal está em `src/App.vue` e `src/personal/`.
