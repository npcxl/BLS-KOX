import { useModel } from '@umijs/max';
import packageJson from '@root/package.json';
import { createStyles } from 'antd-style';
import React from 'react';

const getRepoUrl = () => {
  if (!packageJson.repository)
    return 'https://github.com/ant-design/ant-design-pro';
  const repo =
    typeof packageJson.repository === 'string'
      ? packageJson.repository
      : (packageJson.repository as { url: string }).url;
  const match = repo.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!match) return 'https://github.com/ant-design/ant-design-pro';
  return `https://github.com/${match[1]}/${match[2]}`;
};

const REPO_URL = getRepoUrl();

const useStyles = createStyles(({ token, css }) => ({
  footer: css`
    padding: 16px 24px;
    text-align: center;
    color: ${token.colorTextDescription};
    font-size: ${token.fontSizeSM}px;
    line-height: ${token.lineHeight};
    background: transparent;
  `,
  copyright: css`
    margin-bottom: 6px;
  `,
  link: css`
    color: ${token.colorTextDescription};
    text-decoration: none;
    transition: color ${token.motionDurationMid};

    &:hover {
      color: ${token.colorText};
    }
  `,
  meta: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px 12px;
    font-family: ${token.fontFamilyCode};
    font-size: ${token.fontSizeSM - 1}px;
  `,
  group: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
  `,
  label: css`
    color: ${token.colorTextQuaternary};
  `,
}));

const Footer: React.FC = () => {
  const { styles } = useStyles();
  const { initialState } = useModel('@@initialState');
  const year = new Date().getFullYear();
  const appName = initialState?.systemMap?.['sys.app.name'] || 'title-default';
  const sysVersion = initialState?.systemMap?.['sys.version'];

  return (
    <div className={styles.footer}>
      <div className={styles.copyright}>@{appName} &copy; {year}</div>
      <div className={styles.meta}>
        <span className={styles.group}>
          <span className={styles.label}>版本</span>
          <a
            className={styles.link}
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {sysVersion || packageJson.version}
          </a>
        </span>
      </div>
    </div>
  );
};

export default Footer;
