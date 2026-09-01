const LINKS = [
  { label: 'Fb', href: 'https://www.facebook.com/', name: 'Facebook' },
  { label: 'In', href: 'https://www.instagram.com/', name: 'Instagram' },
  { label: 'Tw', href: 'https://twitter.com/', name: 'Twitter' },
];

export default function SocialLinks() {
  return (
    <ul className="social">
      {LINKS.map((link, index) => (
        <li key={link.label}>
          {index > 0 && <span className="social__sep" aria-hidden="true" />}
          <a className="social__link" href={link.href} target="_blank" rel="noreferrer noopener">
            <span aria-hidden="true">{link.label}</span>
            <span className="visually-hidden">{link.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
