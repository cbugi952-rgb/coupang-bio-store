# linkbio CLI

터미널·스크립트·발행 파이프라인에서 링크인바이오(kkanajae-links)의 픽·프로필을 관리하는 CLI. 웹 GUI·MCP 서버와 **같은 REST API**(`/api/sites/{handle}/...`)를 친다 — 진실의 원천은 API. **의존성 0**(Node 18+ 내장만).

웨지(자동화-네이티브)의 세 번째 클라이언트: 웹 GUI(사람) · MCP(AI 에이전트) · **CLI(스크립트·터미널)**.

## 설치

```bash
# 전역 링크(개발용)
cd cli && npm link          # → linkbio 명령 사용 가능
# 또는 직접 실행
node cli/linkbio.js <명령>
```

## 로그인 (키 저장)

키는 `~/.config/linkbio/config.json`에 저장(POSIX면 권한 600). 사이트 스코프 키(`sk_live_…`) 또는 관리자 비밀번호(도그푸딩)를 쓴다.

```bash
linkbio login --key sk_live_xxx --handle kkanajae
echo sk_live_xxx | linkbio login          # 키를 stdin으로(히스토리에 안 남김)
linkbio whoami                            # 현재 base·handle·key(마스킹)
```

환경변수 `API_BASE` · `API_KEY` · `SITE_HANDLE` 로도 덮어쓸 수 있다(CI·일회성 스크립트용, 로그인 없이).

## 명령

```bash
linkbio picks list                        # 픽 목록
linkbio picks add --ep EP15 --topic 쿨매트 --coupang <url> --toss <url> --category 반려 --latest
linkbio picks update <id> --toss <url>    # 부분 수정 (값 없는 --toss = 그 필드 지우기)
linkbio picks rm <id>
linkbio picks latest <id>                 # 대표(최신) 지정
linkbio picks reorder <id1> <id2> ...     # 순서 재정렬

linkbio profile get                       # 공개 읽기(키 불필요)
linkbio profile set --notice "이번 주 신상 3종" --instagram https://instagram.com/kkanajae
linkbio stats                             # 방문·클릭·전환율

linkbio url                               # 공개/관리자 주소
```

`--json` 을 붙이면 원본 JSON(파이프·jq용). 각 명령은 MCP 툴과 1:1 대응한다.

## 발행 파이프라인 훅

"영상 올리면 픽 자동 추가" — 예:

```bash
linkbio picks add --ep "$EP" --topic "$TOPIC" \
  --coupang "$COUPANG" --toss "$TOSS" --category "$CAT" --latest
```

> ⚠️ 프로덕션에 세밀 API(`/api/sites/...`)가 배포된 뒤에만 실서버로 동작한다. 로컬은 `API_BASE=http://127.0.0.1:PORT/api` 로 미니 서버에 붙여 검증.
