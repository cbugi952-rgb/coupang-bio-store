# CLI · MCP npm 배포 가이드

CLI(`cli/`)와 MCP 서버(`mcp/`)는 완성·검증됐지만 **아직 npm에 배포 안 됨**. 배포하면 관리자 "개발자 · API 연동" 패널의 `npm i -g onshelf` / `npx -y onshelf-mcp`가 실제로 동작한다. **배포엔 부기의 npm 계정이 필요**(Claude가 대신 못 함).

## 순서

1. **npm 가입 + 로그인** — https://www.npmjs.com 가입 후 터미널에서:
   ```
   npm login
   ```

2. **이름 사용 가능 확인**:
   ```
   npm view onshelf
   npm view onshelf-mcp
   ```
   - `404 Not Found` → 그 이름 사용 가능.
   - 이미 있으면 → 스코프 이름으로 바꾼다: `cli/package.json`·`mcp/package.json`의 `"name"`을 `@내npm아이디/onshelf`·`@내npm아이디/onshelf-mcp`로 수정. (그리고 `admin.html`의 연동 스니펫 2줄도 같은 이름으로 — Claude에게 "스니펫 이름 바꿔줘" 하면 됨.)

3. **배포**:
   ```
   cd cli && npm publish --access public
   cd ../mcp && npm publish --access public
   ```

4. **확인** (다른 데서):
   ```
   npm i -g onshelf
   onshelf --version
   npx -y onshelf-mcp   # (env 없이 실행하면 공개 읽기만)
   ```

## 갱신할 때
코드 고친 뒤 `package.json`의 `"version"` 올리고(예: 0.1.0 → 0.1.1) 다시 `npm publish`.

## 지금 배포 없이 되는 것
- **REST API**는 배포 필요 없음 — 사용자가 자기 키로 지금 바로 `curl` / 자기 스크립트로 사용 가능.
- CLI/MCP는 로컬(레포)에서 `node cli/onshelf.js …` / MCP는 파일 경로로 이미 동작(개발·도그푸딩용). npm 배포는 **남들이 쉽게 설치**하게 만드는 단계.
