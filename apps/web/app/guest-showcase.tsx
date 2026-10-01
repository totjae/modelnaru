const features = [
  [
    '파일을 대화의 맥락으로',
    '문서·PDF를 첨부하고, 지원 모델에는 이미지도 전달합니다. 스캔 문서는 OCR로 내용을 추출합니다.',
  ],
  [
    '필요할 때 웹 검색',
    '관리자가 허용한 검색 지원 모델에서 최신 정보를 찾으며 대화할 수 있습니다.',
  ],
  [
    '대화 제목은 자동으로',
    '관리자가 지정한 제목 모델이 대화를 정리합니다. 직접 제목을 수정하는 것도 가능합니다.',
  ],
  [
    '다른 답변도 비교',
    '답변을 다시 생성하고 이전 응답과 오가며 비교합니다. 생성 중에는 멈출 수 있습니다.',
  ],
  [
    '자주 쓰는 것은 가까이',
    '모델 즐겨찾기와 대화 고정으로 자주 사용하는 모델과 작업에 빠르게 돌아옵니다.',
  ],
  [
    '긴 대화의 맥락 유지',
    '설정된 기준에 따라 오래된 대화를 요약합니다. 페이지를 옮겨도 진행 중인 생성에 다시 연결합니다.',
  ],
];

export function GuestShowcase() {
  return (
    <div className="guest-showcase">
      <section className="showcase-intro" aria-labelledby="showcase-concept">
        <p className="eyebrow">ABOUT MODELNARU</p>
        <h2 id="showcase-concept">
          모델은 다양하게.
          <br />
          대화의 경험은 하나로.
        </h2>
        <p>
          ModelNaru는 여러 AI 제공자의 모델을 한곳에서 사용하는 셀프호스팅 AI
          작업 공간입니다. 사용자에게는 모델과 생성 방식을 선택하는 자유를,
          관리자에게는 연결·권한·사용량을 관리하는 한곳의 운영 화면을
          제공합니다.
        </p>
      </section>

      <section className="showcase-row" aria-labelledby="showcase-workspace">
        <div className="showcase-copy">
          <p className="eyebrow">01 · YOUR WORKSPACE</p>
          <h2 id="showcase-workspace">
            모델을 고르고,
            <br />
            답변의 방식을 조절하세요.
          </h2>
          <p>
            같은 질문도 모델과 설정에 따라 다른 답변이 됩니다. 대화마다 모델을
            선택하고, Temperature나 출력 토큰 등 해당 모델이 지원하는 파라미터를
            조절할 수 있습니다.
          </p>
          <p className="showcase-note">
            기본값으로 시작해 필요한 항목만 직접 설정하세요. 선택 가능한 모델과
            기능은 관리자가 부여한 권한에 따라 달라집니다.
          </p>
        </div>
        <figure className="showcase-preview">
          <figcaption>사용자 작업 공간 · 구성 예시</figcaption>
          <div className="showcase-chat-example">
            <p className="showcase-preview-title">
              새로운 아이디어를 위한 대화
            </p>
            <div className="showcase-message">
              이 아이디어를 세 가지 관점에서 비교해 줘.
            </div>
            <p>가능성, 구현 난이도, 사용자 경험을 기준으로 함께 살펴볼게요.</p>
          </div>
          <dl className="showcase-settings-example">
            <div>
              <dt>선택 모델</dt>
              <dd>
                내가 등록한 모델{' '}
                <span className="showcase-badge">즐겨찾기</span>
              </dd>
            </div>
            <div>
              <dt>Temperature</dt>
              <dd>
                0.7 <span className="showcase-meter" aria-hidden="true" />
              </dd>
            </div>
            <div>
              <dt>최대 출력 토큰</dt>
              <dd>2,048</dd>
            </div>
            <div>
              <dt>웹 검색</dt>
              <dd>지원 모델에서 선택</dd>
            </div>
          </dl>
          <p className="showcase-preview-footnote">
            설명용 가상 화면입니다. 실제 모델·설정값이 아닙니다.
          </p>
        </figure>
      </section>

      <section
        className="showcase-features"
        aria-labelledby="showcase-features"
      >
        <p className="eyebrow">MORE THAN A TEXT BOX</p>
        <h2 id="showcase-features">대화를 이어가는 작은 도구들</h2>
        <div className="showcase-feature-grid">
          {features.map(([title, description], index) => (
            <article key={title}>
              <span className="showcase-feature-number" aria-hidden="true">
                0{index + 1}
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <p className="showcase-note">
          첨부·웹 검색은 모델 지원과 관리자 허용 범위 안에서 제공됩니다. 자동
          제목과 대화 요약은 관리자가 보조 모델을 설정해야 사용할 수 있습니다.
        </p>
      </section>

      <section className="showcase-row" aria-labelledby="showcase-admin">
        <div className="showcase-copy">
          <p className="eyebrow">02 · OPERATIONS</p>
          <h2 id="showcase-admin">
            사용은 간결하게.
            <br />
            운영은 세밀하게.
          </h2>
          <p>
            관리자는 사용량과 오류를 살피고, 사용자·게스트에게 허용할 모델과
            일일 한도를 정합니다. AI 제공자 연결과 모델 등록부터 자동 제목·요약
            모델 지정까지 관리합니다.
          </p>
          <ul>
            <li>사용량: 호출 횟수·토큰·비용 추정 확인</li>
            <li>로그: 요청 오류와 운영·보안 이벤트 확인</li>
            <li>접근 관리: 사용자·게스트 권한과 사용 한도 설정</li>
            <li>Provider: 연결·모델 등록 및 지원 기능 관리</li>
          </ul>
        </div>
        <figure className="showcase-preview">
          <figcaption>관리자 사용량·운영 화면 · 가상 데이터</figcaption>
          <div className="showcase-example-tabs" aria-hidden="true">
            <span>사용량</span>
            <span>로그</span>
            <span>사용자</span>
            <span>Provider</span>
          </div>
          <dl className="showcase-metrics">
            <div>
              <dt>오늘의 요청</dt>
              <dd>
                128<span>회</span>
              </dd>
            </div>
            <div>
              <dt>사용 토큰</dt>
              <dd>
                84.2<span>K</span>
              </dd>
            </div>
            <div>
              <dt>활성 연결</dt>
              <dd>
                3<span>개</span>
              </dd>
            </div>
          </dl>
          <div className="showcase-bars">
            <p>모델별 요청 비중 · 예시</p>
            <div>
              <span>모델 A</span>
              <i style={{ width: '72%' }} />
              <span>56%</span>
            </div>
            <div>
              <span>모델 B</span>
              <i style={{ width: '38%' }} />
              <span>30%</span>
            </div>
            <div>
              <span>로컬 모델</span>
              <i style={{ width: '18%' }} />
              <span>14%</span>
            </div>
          </div>
          <p className="showcase-preview-footnote">
            공개 소개용 예시입니다. 운영 데이터와 관리자 기능은 공개하지
            않습니다.
          </p>
        </figure>
      </section>

      <section className="showcase-adapter" aria-labelledby="showcase-adapter">
        <p className="eyebrow">03 · UNDER THE HOOD</p>
        <h2 id="showcase-adapter">
          다른 AI를 연결하는 공통 언어,
          <br />
          Provider Adapter.
        </h2>
        <p>
          제공자마다 다른 요청 형식과 응답 스트리밍을 어댑터가 변환합니다. 대화
          화면은 공통 인터페이스를 사용하고, 각 어댑터는 모델별
          파라미터·첨부·종료 상태·사용량을 처리합니다.
        </p>
        <ol className="showcase-flow" aria-label="AI 요청 처리 구조">
          <li>
            <strong>하나의 대화 화면</strong>
            <span>메시지 · 모델 · 생성 설정</span>
          </li>
          <li>
            <strong>Provider Adapter</strong>
            <span>요청 변환 · 스트리밍 응답 정규화</span>
          </li>
          <li>
            <strong>다양한 연결</strong>
            <span>내장 제공자 · 커스텀 API · 로컬 모델</span>
          </li>
        </ol>
        <p className="showcase-note">
          커스텀 연결은 지원 프로토콜에 맞는 API 주소와 자격증명으로 등록합니다.
          로컬 모델도 서버에서 연결 가능한 호환 API로 연동하며, 모든 제공자의
          모든 기능을 동일하게 지원하는 것은 아닙니다.
        </p>
      </section>
    </div>
  );
}
