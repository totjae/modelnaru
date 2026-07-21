const foundationItems = [
  ['설정', 'config.yaml 검증과 안전한 관리자 초기화'],
  ['연결', '단일 gateway를 통한 Web·API routing'],
  ['저장소', 'PostgreSQL·Valkey의 비공개 내부 network'],
] as const;

export default function HomePage() {
  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <div className="mark" aria-hidden="true">
          나루
        </div>
        <p className="eyebrow">MODELNARU · FOUNDATION</p>
        <h1 id="page-title">여러 모델로 건너가는 하나의 대화 공간</h1>
        <p className="lead">
          ModelNaru의 서버 기반이 준비되고 있습니다. 다음 단계에서 관리자
          로그인과 사용자 관리가 이 화면에 연결됩니다.
        </p>
        <div className="status" role="status">
          <span className="status-dot" /> 기반 서비스 준비됨
        </div>
      </section>

      <section className="foundation" aria-label="현재 기반 구성">
        {foundationItems.map(([title, description], index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
