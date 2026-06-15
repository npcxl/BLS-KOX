import { InfoCircleOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { Tooltip } from 'antd';
import React from 'react';
import packageJson from '@root/package.json';

const VersionDropdown: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const version = initialState?.systemMap?.['sys.version'] || packageJson.version;

  if (!version) return null;

  return (
    <Tooltip title={`当前版本：${version}`}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <InfoCircleOutlined />
        v{version}
      </span>
    </Tooltip>
  );
};

export default VersionDropdown;
