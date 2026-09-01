/** Title and copy, floating directly on the studio — no card, no container. */
export default function ProjectInfo({ vehicle }) {
  return (
    <section className="info" aria-labelledby="project-title" aria-live="polite">
      <h1 className="info__title" id="project-title" data-anim="info">
        {vehicle.title}
      </h1>
      <p className="info__body" data-anim="info">
        {vehicle.description}
      </p>
      <p className="info__body info__body--secondary" data-anim="info">
        {vehicle.secondary}
      </p>
    </section>
  );
}
