import { useEffect, useMemo, useState } from 'react';
import '@wangeditor/editor/dist/css/style.css';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor';
import { useFileUpload } from '@/hooks/useFileUpload';
import './index.css';

type RichTextEditorProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
};

export default function RichTextEditor({ value = '', onChange, placeholder }: RichTextEditorProps) {
  const [editor, setEditor] = useState<IDomEditor | null>(null);
  const { upload, uploading } = useFileUpload({
    uploadUrl: '/api/system/storage/upload',
    defaultData: {
      accessType: 'public',
      moduleName: 'news',
    },
  });

  const toolbarConfig: Partial<IToolbarConfig> = useMemo(
    () => ({
      toolbarKeys: [
        'headerSelect',
        'bold',
        'underline',
        'italic',
        'through',
        'color',
        'bgColor',
        'fontSize',
        'fontFamily',
        'indent',
        'delIndent',
        'justifyLeft',
        'justifyRight',
        'justifyCenter',
        'justifyJustify',
        'bulletedList',
        'numberedList',
        'uploadImage',
        'insertLink',
        'emotion',
        'blockquote',
        'codeBlock',
        'divider',
        'undo',
        'redo',
      ],
    }),
    [],
  );

  const editorConfig: Partial<IEditorConfig> = useMemo(
    () => ({
      placeholder: placeholder || '请输入内容',
      MENU_CONF: {
        uploadImage: {
          customUpload: async (file: File, insertFn: (url: string, alt?: string, href?: string) => void) => {
            if (!file.type.startsWith('image/')) return;
            const result = await upload({ file, filename: file.name });
            if (!result.url) throw new Error('上传成功，但未获取到图片地址');
            insertFn(result.url, file.name, result.url);
          },
        },
      },
    }),
    [placeholder, upload],
  );

  useEffect(() => {
    return () => {
      if (editor == null) return;
      editor.destroy();
      setEditor(null);
    };
  }, [editor]);

  return (
    <div className="bls-rich-editor">
      <Toolbar editor={editor} defaultConfig={toolbarConfig} mode="default" className="bls-rich-editor__toolbar" />
      <div className="bls-rich-editor__body">
        <Editor
          value={value}
          defaultConfig={editorConfig}
          mode="default"
          onCreated={setEditor}
          onChange={(ed) => onChange?.(ed.getHtml())}
        />
        {uploading ? <div className="bls-rich-editor__uploading">图片上传中...</div> : null}
      </div>
    </div>
  );
}
