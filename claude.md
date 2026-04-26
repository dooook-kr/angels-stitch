# Technical Specification & Logic Architecture

## 1. Architecture Overview
- **UI & Interaction Layer:** HTML5 Canvas, CSS Flexbox/Grid (Mobile Responsive), Custom Touch Gesture Handler.
- **State & Storage Layer:** IndexedDB (대용량 프로젝트 메타데이터, 픽셀 맵, 진행도 마킹 데이터 영구 저장), JavaScript 객체 상태 관리.
- **Worker Layer:** `worker.js`를 통한 이미지 양자화 및 매핑 연산 격리.

## 2. Core Logic Details

### A. Image Processing & Preview Pipeline
- 원본 이미지를 `FileReader`로 로드 후, 파라미터 조작 시 UI 피드백 지연을 막기 위해 저해상도 썸네일 기반의 빠른 프리뷰를 먼저 렌더링.
- 최종 '도안 생성' 시 가상 `<canvas>`를 통해 사용자가 설정한 격자 크기로 이미지를 동적 리사이징(Dynamic Resizing).

### B. Color Quantization & DMC Mapping (Web Worker)
- 리사이징된 `ImageData`를 Worker로 전송하여 K-Means 클러스터링 알고리즘 수행.
- **DMC Color Dictionary:** 표준 DMC 실 데이터(RGB, 코드, 기호, 타래량) 배열 활용.
- **매핑 알고리즘:** 유클리디안 거리(Euclidean Distance) 및 LAB 색상 공간 변환을 통해 클러스터링된 색상을 가장 근접한 DMC 실 색상에 매핑.

### C. Digital Stitch Tracking System
- **Canvas Rendering:** 양자화된 픽셀 맵 기반으로 도안 렌더링. 화면 스케일링(Pinch-to-zoom) 및 이동(Pan) 지원.
- **Interactive Marking:** 캔버스 터치 이벤트를 픽셀 그리드 좌표로 역산하여 '완료' 상태 토글.
- **Persistence:** 마킹 상태 변경 즉시 IndexedDB에 비동기 저장하여 데이터 유실 방지 및 진행률(%) 계산.

### D. PDF Generation Engine
- **Cover Page:** 프로젝트 메타데이터, 완성 예상 썸네일 삽입.
- **Grid Pages:** 도안을 A4 해상도 단위로 분할 계산하여 렌더링. 가독성을 위해 각 격자에 DMC 기호(Symbol) 삽입.
- **Summary Page:** 사용된 DMC 코드, 기호, 총 스티치 수, 예상 타래(Skein) 수 기반의 구매/요약표 생성. (jsPDF 등 활용)
