/**
 * The film card. The still is the project's own studio render, keyed off its
 * white sweep at build time so it belongs to this palette rather than sitting
 * on it. Pressing play hands the frame over to the vehicle itself.
 */
export default function MediaPreview({ vehicle, onPlay, disabled }) {
  return (
    <figure className="media" data-anim="rail">
      <div className="media__frame">
        <img
          className="media__image"
          src={vehicle.media}
          srcSet={`${vehicle.media} 1x, ${vehicle.media2x} 2x`}
          alt={`${vehicle.name} — studio render`}
          width="720"
          height="720"
          decoding="async"
          draggable="false"
        />
      </div>
      <button type="button" className="media__play" onClick={onPlay} disabled={disabled}>
        <span className="visually-hidden">{vehicle.mediaLabel}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 6.2 18.4 12 9 17.8Z" fill="currentColor" />
        </svg>
      </button>
    </figure>
  );
}
