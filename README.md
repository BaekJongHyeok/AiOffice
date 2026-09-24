# AI OFFICE v0.2.2 · Git Update Edition

이 버전부터는 매번 새 ZIP을 풀지 않고 같은 프로젝트 폴더를 계속 사용합니다.

## 최초 1회

1. Git for Windows가 없다면 설치합니다: https://git-scm.com/download/win
2. GitHub에서 빈 저장소를 하나 만듭니다. 예: `ai-office`
   - README / .gitignore / License는 GitHub에서 추가하지 마세요.
3. 이 폴더의 `SETUP_GITHUB.bat`을 실행합니다.
4. 화면에 GitHub 저장소 HTTPS 주소를 붙여넣습니다.
5. 처음 push할 때 GitHub 로그인이 요청될 수 있습니다.

## 이후 실행

- 평소 실행: `RUN.bat`
- 최신 코드 받기 + 실행: `UPDATE_AND_RUN.bat`
- 또는 AI OFFICE 왼쪽 아래 `↻ 업데이트 & 재시작` 버튼

## 개발 흐름

앞으로 코드는 하나의 Git 저장소를 기준으로 관리할 수 있습니다. 로컬 소스 파일에 직접 수정사항이 있으면 자동 업데이트가 덮어쓰지 않고 중단하도록 되어 있습니다.

## 현재 AI 방식

유료 OpenAI / Anthropic / Gemini API는 호출하지 않습니다. ChatGPT, Claude, Gemini 웹 구독용 별도 로그인 창과 작업 큐를 사용합니다. 각 서비스의 구독 한도와 이용 조건은 그대로 적용됩니다.
