# linkbio MCP 서버

클로드·커서 등 AI 에이전트가 링크인바이오(kkanajae-links)의 픽·프로필을 **자연어로** 관리하게 하는 MCP 서버. "링크인바이오는 전부 GUI 전용"이라는 판을 깨는 웨지(자동화-네이티브)의 실물.

각 툴은 REST API(`/api/sites/{handle}/...`)의 얇은 래퍼다. 진실의 원천은 API.

## 툴
| 툴 | 동작 |
|---|---|
| `list_picks` | 픽 목록 |
| `add_pick` | 픽 추가 (topic·coupang 필수) |
| `update_pick` | 픽 부분 수정 |
| `delete_pick` | 픽 삭제 |
| `set_latest` | 대표(최신) 픽 지정 |
| `reorder_picks` | 순서 변경 |
| `update_profile` | 프로필·소셜·공지 수정 |
| `get_stats` | 방문·클릭·전환율 |

## 환경변수
- `API_BASE` — 기본 `https://coupang-bio-store.vercel.app/api`
- `API_KEY` — 사이트 키(`sk_live_...`) **또는** 관리자 비밀번호(`ADMIN_PASSWORD`). 없으면 공개 읽기만.
- `SITE_HANDLE` — 기본 `kkanajae`

## 설치 — Claude Desktop
`claude_desktop_config.json`에 추가:
```json
{
  "mcpServers": {
    "linkbio": {
      "command": "node",
      "args": ["C:\\Users\\yugeo\\Desktop\\kkanajae-links\\mcp\\server.js"],
      "env": {
        "API_BASE": "https://coupang-bio-store.vercel.app/api",
        "API_KEY": "여기에_ADMIN_PASSWORD_또는_sk_live_키",
        "SITE_HANDLE": "kkanajae"
      }
    }
  }
}
```

## 설치 — Claude Code
```bash
claude mcp add linkbio -e API_KEY=<키> -e API_BASE=https://coupang-bio-store.vercel.app/api -- node C:\Users\yugeo\Desktop\kkanajae-links\mcp\server.js
```

## 데모
> "EP14 텀블러 픽 추가해 — 쿠팡 https://link.coupang.com/a/..., 카테고리 주방, 최신으로."

→ 공개페이지에 라이브 반영.

> ⚠️ 프로덕션에 세밀 API(`/api/sites/...`)가 배포된 뒤에만 동작한다. `git push` → Vercel 자동배포 후 사용.
