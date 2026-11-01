# 버튜버 옷 만들기

내 VRM 캐릭터 몸에 맞춰 옷을 브라우저에서 바로 바꾸고, 시청자와 고르고, VRM 파일과 디자인 시트로 받는 시제품.

https://kuyh2185.github.io/vtuber-wardrobe/

- 옷은 파일을 옮기지 않고 그 캐릭터의 몸 지도 위에서 코드로 생성한다(`atelier/`).
- 올린 VRM은 브라우저 안에서만 쓰고 어디로도 보내지 않는다.
- 지금은 VRoid로 만든 VRM 0.x만 입힐 수 있다. 시청자 투표는 가상의 표다.
- 빌드 없음. `main`에 push하면 GitHub Pages로 배포된다.

## 점검

```
PLAYWRIGHT=<playwright 경로> node atelier/drive.mjs out/drive
PLAYWRIGHT=<playwright 경로> node atelier/rec.mjs out/rec
```

`drive.mjs`는 로컬의 `samples/VRM1_Constraint_Twist_Sample.vrm`도 쓴다(저장소에는 없음).

## 샘플 캐릭터

`samples/`의 AvatarSample D·E·G는 pixiv VRoid 프로젝트의 샘플이다. 파일 메타데이터의 VRoid Hub 조건은 수정·재배포·상업 사용 허용, 크레딧 불필요다.
