import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { registerMembershipUnauthorizedHandler } from './api';
import { useSessionStore } from './stores/session';
import { showDialog } from 'vant';
import 'vant/lib/index.css';
import './styles/theme.css';
import {
  Button,
  NavBar,
  Tabbar,
  TabbarItem,
  Cell,
  CellGroup,
  Card,
  Tag,
  Empty,
  Loading,
  Dialog,
  Toast,
  Form,
  Field,
  List,
  PullRefresh,
  Grid,
  GridItem,
  Divider,
  NoticeBar,
  Radio,
  RadioGroup,
  Popup,
  Tabs,
  Tab,
  Collapse,
  CollapseItem,
  Switch,
  Icon,
  Uploader,
  Calendar,
  Search,
} from 'vant';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

registerMembershipUnauthorizedHandler(() => {
  const session = useSessionStore(pinia);
  if (!session.isActive) return;
  session.clear();
  showDialog({
    title: '会话已失效',
    message: '兑换会话已过期或失效，请重新输入兑换码',
  });
});
[
  Button,
  NavBar,
  Tabbar,
  TabbarItem,
  Cell,
  CellGroup,
  Card,
  Tag,
  Empty,
  Loading,
  Dialog,
  Toast,
  Form,
  Field,
  List,
  PullRefresh,
  Grid,
  GridItem,
  Divider,
  NoticeBar,
  Radio,
  RadioGroup,
  Popup,
  Tabs,
  Tab,
  Collapse,
  CollapseItem,
  Switch,
  Icon,
  Uploader,
  Calendar,
  Search,
].forEach((c) => app.use(c));

app.mount('#app');
