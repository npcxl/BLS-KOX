import {
  BookOutlined,
  CheckOutlined,
  ForkOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import {
  getAllLocales,
  getLocale,
  history,
  setLocale,
  useModel,
} from '@umijs/max';
import type { MenuProps } from 'antd';
import { Button, Tooltip } from 'antd';
import { createStyles } from 'antd-style';
import React, { useMemo } from 'react';
import HeaderDropdown from '../HeaderDropdown';

export const localeLabelMap: Record<string, { emoji: string; label: string }> =
  {
    'zh-CN': { emoji: '🇨🇳', label: '简体中文' },
    'zh-TW': { emoji: '🇭🇰', label: '繁體中文' },
    'en-US': { emoji: '🇺🇸', label: 'English' },
    'ja-JP': { emoji: '🇯🇵', label: '日本語' },
    'pt-BR': { emoji: '🇧🇷', label: 'Português' },
    'id-ID': { emoji: '🇮🇩', label: 'Bahasa Indonesia' },
    'fa-IR': { emoji: '🇮🇷', label: 'فارسی' },
    'bn-BD': { emoji: '🇧🇩', label: 'বাংলা' },
  };

const useStyles = createStyles(({ token, css }) => ({
  action: css`
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    height: 36px !important;
    min-width: 36px;
    padding-inline: 8px !important;
    padding-block: 0 !important;
    border-radius: ${token.borderRadius}px !important;
  `,
  headerButton: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 10px;
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    box-shadow: ${token.boxShadowTertiary};
  `,
  headerMeta: css`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.1;
  `,
  headerMetaLabel: css`
    font-size: ${token.fontSizeSM - 1}px;
    color: ${token.colorTextDescription};
  `,
  headerMetaValue: css`
    font-size: ${token.fontSize}px;
    font-weight: 500;
    color: ${token.colorText};
  `,
}));

export const DocLink: React.FC = () => {
  const { styles } = useStyles();
  return (
    <Tooltip title="使用文档">
      <Button
        type="text"
        className={styles.action}
        icon={<BookOutlined />}
        aria-label="使用文档"
        onClick={() => {
          history.push('/welcome');
        }}
      />
    </Tooltip>
  );
};




const onVersionClick: MenuProps['onClick'] = ({ key }) => {
  window.open(key, '_blank', 'noopener,noreferrer');
};


export const LangDropdown: React.FC = () => {
  const { styles } = useStyles();
  const allLocales = useMemo(() => getAllLocales(), []);
  const currentLocale = getLocale();
  const supportLocales = allLocales.filter((l) => l in localeLabelMap);

  if (supportLocales.length <= 1) {
    return null;
  }

  const langItems: MenuProps['items'] = supportLocales.map((locale) => ({
    key: `lang-${locale}`,
    icon:
      locale === currentLocale ? (
        <CheckOutlined style={{ color: '#52c41a' }} />
      ) : (
        <span style={{ display: 'inline-block', width: 14 }} />
      ),
    label: `${localeLabelMap[locale]?.emoji ?? ''} ${localeLabelMap[locale]?.label ?? locale}`,
  }));

  const onLangClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('lang-')) {
      setLocale(key.replace('lang-', ''), false);
    }
  };

  return (
    <HeaderDropdown
      placement="bottomRight"
      arrow
      menu={{
        selectedKeys: [`lang-${currentLocale}`],
        onClick: onLangClick,
        items: langItems,
        style: { minWidth: 180 },
      }}
    >
      <Button type="text" className={styles.action} aria-label="语言切换">
        <GlobalOutlined />
      </Button>
    </HeaderDropdown>
  );
};
