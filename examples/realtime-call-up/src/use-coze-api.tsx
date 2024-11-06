import { useEffect, useState } from 'react';

import {
  CozeAPI,
  getPKCEAuthenticationUrl,
  getPKCEOAuthToken,
  refreshOAuthToken,
  type OAuthToken,
  type WorkSpace,
  type CloneVoiceReq,
  type SimpleBot,
} from '@coze/api';

export interface VoiceOption {
  label: React.ReactNode;
  value: string;
  preview_url?: string;
  name: string;
  language_code: string;
  language_name: string;
  is_system_voice: boolean;
  available_training_times: number;
  preview_text: string;
}

export interface BotOption {
  value: string;
  label: string;
  avatar?: string;
}

export interface WorkspaceOption {
  value: string;
  label: string;
}

const DEFAULT_OAUTH_CLIENT_ID = '30367348905137699749500653976611.app.coze';

export const INVALID_ACCESS_TOKEN = 'code: 4100';

const useCozeAPI = ({
  accessToken,
  baseURL = 'https://api.coze.cn',
}: {
  accessToken: string;
  baseURL: string;
}) => {
  const [api, setApi] = useState<CozeAPI | null>(null);

  useEffect(() => {
    if (accessToken && baseURL) {
      setApi(
        new CozeAPI({
          token: accessToken,
          baseURL,
          allowPersonalAccessTokenInBrowser: true,
        }),
      );
    }
  }, [accessToken, baseURL]);

  const getCurrentLocation = () =>
    `${window.location.protocol}//${window.location.host}${window.location.pathname}`;

  const getAuthUrl = async (): Promise<{
    url: string;
    codeVerifier: string;
  }> => {
    return getPKCEAuthenticationUrl({
      baseURL: baseURL,
      clientId: DEFAULT_OAUTH_CLIENT_ID,
      redirectUrl: getCurrentLocation(),
    });
  };

  const getToken = async (
    code: string,
    codeVerifier: string,
  ): Promise<OAuthToken> => {
    return await getPKCEOAuthToken({
      code,
      baseURL,
      clientId: DEFAULT_OAUTH_CLIENT_ID,
      redirectUrl: getCurrentLocation(),
      codeVerifier,
    });
  };

  const refreshToken = async (refreshToken: string): Promise<OAuthToken> => {
    return await refreshOAuthToken({
      baseURL,
      clientId: DEFAULT_OAUTH_CLIENT_ID,
      clientSecret: '',
      refreshToken,
    });
  };

  const getPersonalWorkspace = async (): Promise<WorkSpace | null> => {
    const page_size = 50;
    let page_num = 1;
    let hasMore = true;
    while (hasMore) {
      const workspaces = await api?.workspaces.list({
        page_num,
        page_size,
      });
      console.log(`get workspaces 2: ${workspaces?.workspaces.length}`);
      for (const workspace of workspaces?.workspaces || []) {
        console.log(`get workspace: ${workspace.name} ${workspace.id}`);
        if (workspace.workspace_type === 'personal') {
          return workspace;
        }
      }
      hasMore = workspaces?.workspaces.length === page_size;
      page_num++;
    }
    return null;
  };

  const getBotByName = async (
    workspaceId: string,
    botName: string,
  ): Promise<SimpleBot | null> => {
    let pageIndex = 1;
    const pageSize = 20;
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await api?.bots.list({
          space_id: workspaceId,
          page_size: pageSize,
          page_index: pageIndex,
        });

        for (const bot of response?.space_bots || []) {
          if (bot.bot_name === botName) {
            return bot;
          }
        }

        hasMore = response?.space_bots.length === pageSize;
        pageIndex++;
      }

      return null;
    } catch (error) {
      console.error('get getBotByName error:', error);
      throw error;
    }
  };

  const fetchAllVoices = async (): Promise<VoiceOption[]> => {
    try {
      const response = await api?.audio.voices.list();

      // Separate system voices and custom voices
      const customVoices =
        response?.voice_list.filter(voice => !voice.is_system_voice) || [];
      const systemVoices =
        response?.voice_list.filter(voice => voice.is_system_voice) || [];

      // Group system voices by language
      const systemVoicesByLanguage = systemVoices.reduce<
        Record<string, typeof systemVoices>
      >((acc, voice) => {
        const languageName = voice.language_name;
        if (!acc[languageName]) {
          acc[languageName] = [];
        }
        acc[languageName].push(voice);
        return acc;
      }, {});

      // Sort languages alphabetically and flatten voices
      const sortedSystemVoices = Object.entries(systemVoicesByLanguage)
        .sort(([langA], [langB]) => langB.localeCompare(langA))
        .flatMap(([, voices]) => voices);

      // Merge custom voices with sorted system voices and format
      const formattedVoices = [...customVoices, ...sortedSystemVoices].map(
        voice => ({
          value: voice.voice_id,
          preview_url: voice.preview_audio,
          name: voice.name,
          language_code: voice.language_code,
          language_name: voice.language_name,
          is_system_voice: voice.is_system_voice,
          label: `${voice.name} (${voice.language_name})`,
          preview_text: voice.preview_text,
          available_training_times: voice.available_training_times,
        }),
      );

      return formattedVoices;
    } catch (error) {
      console.error('get voices error:', error);
      throw error;
    }
  };

  const getSomeVoice = async (): Promise<VoiceOption | null> => {
    const voices = await fetchAllVoices();
    // 如果有自定义音色，返回，否则返回第一个
    const customVoice = voices.find(voice => !voice.is_system_voice);
    if (customVoice) {
      return customVoice;
    }
    return voices[0];
  };

  const fetchAllWorkspaces = async (): Promise<WorkspaceOption[]> => {
    let pageNum = 1;
    const pageSize = 50;
    let allWorkspaces: WorkspaceOption[] = [];
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await api?.workspaces.list({
          page_size: pageSize,
          page_num: pageNum,
        });

        const workspaces =
          response?.workspaces.map(workspace => ({
            value: workspace.id,
            label: workspace.name,
          })) || [];

        allWorkspaces = [...allWorkspaces, ...workspaces];

        hasMore = response?.workspaces.length === pageSize;
        pageNum++;
      }

      return allWorkspaces;
    } catch (error) {
      console.error('get workspaces error:', error);
      throw error;
    }
  };

  const cloneVoice = async (params: CloneVoiceReq): Promise<string> => {
    try {
      const response = await api?.audio.voices.clone(params);
      return response?.voice_id || '';
    } catch (error) {
      console.error('clone voice error:', error);
      throw error;
    }
  };

  const getOrCreateRealtimeCallUpBot = async (): Promise<SimpleBot | null> => {
    try {
      // 获取个人空间
      const personalWorkspace = await getPersonalWorkspace();
      if (!personalWorkspace) {
        throw new Error('未找到个人空间');
      }

      const botName = 'realtime-call-up';

      // 获取所有机器人
      const realtimeCallUpBot = await getBotByName(
        personalWorkspace.id,
        botName,
      );

      if (realtimeCallUpBot) {
        return realtimeCallUpBot;
      }

      // 如果不存在，创建新机器人
      const newBot = await api?.bots.create({
        space_id: personalWorkspace.id,
        name: botName,
        description: 'A bot for realtime call up demo',
      });

      if (!newBot) {
        throw new Error('创建机器人失败');
      }

      // 发布到 API 渠道
      await api?.bots.publish({
        bot_id: newBot.bot_id,
        connector_ids: ['API'],
      });

      return {
        bot_id: newBot.bot_id,
        bot_name: botName,
        description: '',
        icon_url: '',
        publish_time: '',
      };
    } catch (error) {
      console.error('获取或创建 realtime-call-up 机器人失败:', error);
      throw error;
    }
  };

  return {
    api,
    getAuthUrl,
    getToken,
    refreshToken,
    getSomeVoice,
    fetchAllVoices,
    fetchAllWorkspaces,
    cloneVoice,
    getOrCreateRealtimeCallUpBot,
  };
};

export default useCozeAPI;