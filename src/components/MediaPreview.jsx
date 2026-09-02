/**
 * The film card. The still is the project's own cut-out, padded at build time
 * onto the frame's own aspect so every project sits at the same scale over the
 * card's sweep. Pressing play hands the frame over to the vehicle itself.
 *
 * Projects whose still has not been built yet simply omit the card rather than
 * showing a broken frame.
 */
export default function MediaPreview({ vehicle, onPlay, disabled }) {
  if (!vehicle.media) return null;

  return (
    <figure className="media" data-anim="rail">
      <div className="media__frame">
        <img
          className="media__image"
          src={vehicle.media}
          srcSet={`${vehicle.media} 1x, ${vehicle.media2x} 2x`}
          alt={`${vehicle.name} — studio portrait`}
          width="720"
          height="447"
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
