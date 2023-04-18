import slugify from "slugify";

import { getConfig } from "../config";
import Ressource, { APIObject } from "./Ressource";
import Activity from "./Activity";
import Variable from "./Variable";
import Route from "./Route";
import EnvironmentAccess from "./EnvironmentAccess";
import Metrics from "./Metrics";
import Commit from "./git/Commit";

const paramDefaults = {
  projectId: "project"
};
const modifiableField = [
  "parent",
  "enable_smtp",
  "restrict_robots",
  "http_access",
  "title",
  "type"
];
const _url = "/projects/:projectId/environments";

const sshRegex = /^ssh:\/\/([a-zA-Z0-9_\-]+)@(.+)$/;
const sshLinkKeyPrefix = "pf:ssh:";

export interface EnvironmentGetParams {
  projectId: string;
  id: string;
  [key: string]: any;
}

export interface EnvironmentQueryParams {
  projectId: string;
  [key: string]: any;
}

export enum Status {
  active = "active",
  dirty = "dirty",
  inactive = "inactive",
  deleting = "deleting"
}

interface DeploymentState {
  crons: {
    enabled: boolean;
    status: "running" | "paused";
  };
  last_deployment_at: string | null;
  last_deployment_successful: boolean;
}

interface HttpAccess {
  is_enabled?: boolean;
  addresses?: {
    permission: "allow" | "deny";
    address: string;
  }[];
  basic_auth?: Record<string, string | undefined>;
}

export default class Environment extends Ressource {
  id: string = "";
  status: Status = Status.inactive;
  head_commit: string = "";
  name: string = "";
  parent: string | null = null;
  machine_name: string = "";
  restrict_robots: boolean = false;
  title: string = "";
  created_at: string = "";
  updated_at: string = "";
  last_active_at: string = "";
  last_backup_at: string = "";
  project: string = "";
  is_dirty: boolean = false;
  enable_smtp: boolean = false;
  has_code: boolean = false;
  deployment_target: string = "";
  deployment_state: DeploymentState | undefined = undefined;
  http_access: HttpAccess = {};
  is_main: boolean = false;
  type: string = "";

  constructor(environment: APIObject, url: string) {
    super(url, paramDefaults, environment, environment, [], modifiableField);
  }

  static get(params: EnvironmentGetParams, customUrl?: string) {
    const { projectId, id, ...queryParams } = params;
    const { api_url } = getConfig();
    const urlToCall = customUrl ? `${customUrl}/:id` : `${api_url}${_url}/:id`;

    return super._get<Environment>(
      urlToCall,
      { project: projectId, id },
      paramDefaults,
      queryParams
    );
  }

  static query(params: EnvironmentQueryParams, customUrl?: string) {
    const { projectId, ...queryParams } = params;
    const { api_url } = getConfig();

    return super._query<Environment>(
      customUrl || `${api_url}${_url}`,
      { project: projectId },
      paramDefaults,
      queryParams
    );
  }

  update(data: Partial<Environment>) {
    return super.update(data);
  }

  /**
   * Get the SSH URL for the environment.
   *
   * @param string app An application name.
   *
   * @throws EnvironmentStateException
   *
   * @return string
   */
  getSshUrl(app = "") {
    const urls = this.getSshUrls();

    if (this.hasLink("ssh") && app === "") {
      return this.convertSshUrl(this.getLink("ssh"));
    }

    if (urls[app]) {
      return this.convertSshUrl(urls[app]);
    }

    return this.constructLegacySshUrl(app);
  }

  constructLegacySshUrl(app = "") {
    const suffix = app ? `--${app}` : "";

    return this.convertSshUrl(this.getLink("ssh"), suffix);
  }

  convertSshUrl(url: string, username_suffix = "") {
    const sshUrl = sshRegex.exec(url);
    if (sshUrl) {
      const host = sshUrl[2];
      const user = sshUrl[1];

      return `${user}${username_suffix}@${host}`;
    }
  }

  getSshUrls() {
    const links = this.getLinks();
    if (!links) {
      return {};
    }

    const sshUrls = Object.keys(links)
      .filter(linkKey => linkKey.indexOf(sshLinkKeyPrefix) === 0)
      .reduce((sshUrls: Record<string, string>, linkKey) => {
        sshUrls[linkKey.substr(sshLinkKeyPrefix.length)] = links[linkKey].href;
        return sshUrls;
      }, {});

    if (this.hasLink("ssh") && Object.keys(sshUrls).length === 0) {
      sshUrls["ssh"] = `ssh://${this.constructLegacySshUrl()}`;
    }

    return sshUrls;
  }

  /**
   * Branch (create a new environment).
   *
   * @param string title The title of the new environment.
   * @param string type The type of the new environment
   * @param string id    The ID of the new environment. This will be the Git
   *                      branch name. Leave blank to generate automatically
   *                      from the title.
   *
   * @return Activity
   */
  branch(title: string, type: string, id = this.sanitizeId(title)) {
    const body = { name: id, title, type };

    return this.runLongOperation("branch", "POST", body);
  }

  /**
   * @param string proposed
   *
   * @return string
   */
  sanitizeId(proposed: string) {
    return slugify(proposed).substr(0, 32);
  }

  /**
   * Delete the environment.
   *
   * @throws EnvironmentStateException
   *
   * @return Result
   */
  delete() {
    if (this.isActive()) {
      throw new Error("Active environments cannot be deleted");
    }
    return super.delete();
  }

  /**
   * @return bool
   */
  isActive() {
    return this.status === "active";
  }

  /**
   * Activate the environment.
   *
   * @throws EnvironmentStateException
   *
   * @return Activity
   */
  activate() {
    if (this.isActive()) {
      throw new Error("Active environments cannot be activated");
    }
    return this.runLongOperation("activate", "POST");
  }

  /**
   * Deactivate the environment.
   *
   * @throws EnvironmentStateException
   *
   * @return Activity
   */
  deactivate() {
    if (!this.isActive()) {
      throw new Error("Inactive environments cannot be deactivated");
    }
    return this.runLongOperation("deactivate", "POST", undefined);
  }

  /**
   * Merge an environment into its parent.
   *
   * @throws OperationUnavailableException
   *
   * @return Activity
   */
  merge() {
    if (!this.parent) {
      throw new Error(
        "The environment does not have a parent, so it cannot be merged"
      );
    }
    return this.runLongOperation("merge", "POST");
  }

  /**
   * Synchronize an environment with its parent.
   *
   * @param bool code
   * @param bool data
   *
   * @throws \InvalidArgumentException
   *
   * @return Activity
   */
  synchronize(data: boolean, code: boolean) {
    if (!data && !code) {
      throw new Error("Nothing to synchronize: you must specify data or code");
    }
    const body = { synchronize_data: data, synchronize_code: code };

    return this.runLongOperation("synchronize", "post", body);
  }

  /**
   * Create a backup of the environment.
   *
   * @return Activity
   */
  backup(safe = true) {
    return this.runLongOperation("backup", "POST", { safe });
  }

  /**
   * Redeploy the current environment
   *
   * @return Activity
   */
  redeploy() {
    return this.runLongOperation("redeploy");
  }

  /**
   * Resume the current environment
   *
   * @return Activity
   */
  resume() {
    return this.runLongOperation("resume");
  }

  /**
   * Pause the current environment
   *
   * @return Activity
   */
  pause() {
    return this.runLongOperation("pause");
  }

  /**
   * Get a single environment activity.
   *
   * @param string id
   *
   * @return Activity|false
   */
  getActivity(id: string) {
    return Activity.get({ id }, `${this.getUri()}/activities`);
  }

  /**
   * Get a list of environment activities.
   *
   * @param string type
   *   Filter activities by type.
   * @param int    startsAt
   *   A UNIX timestamp for the maximum created date of activities to return.
   *
   * @return Activity[]
   */
  getActivities(type: string, starts_at: number) {
    const params = { type, starts_at };

    return Activity.query(params, `${this.getUri()}/activities`);
  }

  /**
   * Get a list of variables.
   *
   * @param int limit
   *
   * @return Variable[]
   */
  getVariables(limit: number) {
    return Variable.query(
      { projectId: this.project, environmentId: this.id, limit },
      this.getLink("#manage-variables")
    );
  }

  /**
   * Set a variable
   *
   * @param string name
   * @param mixed  value
   * @param bool   json
   * @param bool   enabled
   * @param bool   inheritable
   * @param bool   sensitive
   * @param bool   visibleBuild
   * @param bool   visibleRuntime
   *
   * @return Result
   */

  setVariable(
    name: string,
    value: string,
    is_json = false,
    is_enabled = true,
    is_inheritable = true,
    is_sensitive = false,
    visible_build = true,
    visible_runtime = true
  ) {
    const values = {
      name,
      value,
      is_json,
      is_enabled,
      is_inheritable,
      is_sensitive,
      visible_build,
      visible_runtime
    };

    return this.getVariable(name)
      .then((existing: Variable) => {
        if (existing && existing.id) {
          return existing.update(values);
        }
      })
      .catch(err => {
        if (err.code === 404) {
          values.name = name;
          const variable = new Variable(
            values,
            this.getLink("#manage-variables")
          );

          return variable.save();
        }
        return err;
      });
  }

  /**
   * Get a single variable.
   *
   * @param string id
   *
   * @return Variable|false
   */
  getVariable(id: string) {
    return Variable.get(
      { projectId: this.project, environmentId: this.id, id },
      this.getLink("#manage-variables")
    );
  }

  /**
   * Set the environment's route configuration.
   *
   * @param object route
   *
   * @return Route
   */
  setRoute(values: Route) {
    if (!values.id) {
      const route = new Route(values, this.getLink("#manage-routes"));

      return route.save();
    }
    return this.getRoute(values.id).then(existing => {
      if (existing && existing.id) {
        return existing.update(
          values,
          `${this.getLink("#manage-routes")}/${encodeURIComponent(existing.id)}`
        );
      }

      const route = new Route(values, this.getLink("#manage-routes"));

      return route.save();
    });
  }

  /**
   * Get the route configuration.
   *
   *
   * @return Route
   */
  getRoute(id: string) {
    return Route.get(
      { projectId: this.project, environmentId: this.id, id },
      this.getLink("#manage-routes")
    );
  }

  /**
   * Get the environment's routes configuration.
   *
   *
   * @return Route[]
   */
  getRoutes() {
    return Route.query(
      { projectId: this.project, environmentId: this.id },
      this.getLink("#manage-routes")
    );
  }

  /**
   * Get the resolved URLs for the environment's routes.
   *
   * @return string[]
   */
  getRouteUrls() {
    const links = this.getLinks();
    if (!links) return [];

    const routes = links["pf:routes"];
    if (!routes || !Array.isArray(routes)) {
      return [];
    }
    return routes.map(route => route.href);
  }

  /**
   * Initialize the environment from an external repository.
   *
   * This can only work when the repository is empty.
   *
   * @param string profile
   *   The name of the profile. This is shown in the resulting activity log.
   * @param string repository
   *   A repository URL, optionally followed by an '@' sign and a branch name,
   *   e.g. 'git://github.com/platformsh/platformsh-examples.git@drupal/7.x'.
   *   The default branch is 'master'.
   *
   * @return Activity
   */
  initialize(profile: string, repository: string) {
    return this.runLongOperation("initialize", "post", { profile, repository });
  }

  /**
   * Get a user's access to this environment.
   *
   * @param string uuid
   *
   * @return EnvironmentAccess|false
   */
  getUser(id: string) {
    return EnvironmentAccess.get(
      { projectId: this.project, environmentId: this.id, id },
      this.getLink("#manage-access")
    );
  }
  /**
   * Get the users with access to this environment.
   *
   * @return EnvironmentAccess[]
   */
  getUsers() {
    return EnvironmentAccess.query(
      { projectId: this.project, environmentId: this.id },
      this.getLink("#manage-access")
    );
  }
  /**
   * Add a new user to the environment.
   *
   * @param string user   The user's UUID or email address (see byUuid).
   * @param string role   One of EnvironmentAccess::roles.
   * @param bool   byUuid Set true (default) if user is a UUID, or false if
   *                       user is an email address.
   *
   * Note that for legacy reasons, the default for byUuid is false for
   * Project::addUser(), but true for Environment::addUser().
   *
   * @return Result
   */
  addUser(user: string, role: string, byUuid = true) {
    const property = byUuid ? "user" : "email";
    const body: {
      id: string;
      role: string;
      user?: string;
      email?: string;
    } = { id: "", role, [property]: user };

    const environmentAccess = new EnvironmentAccess(
      body,
      this.getLink("#manage-access")
    );

    return environmentAccess.save();
  }

  /**
   * Remove a user's access to this environment.
   *
   * @param string uuid
   *
   * @return EnvironmentAccess|false
   */
  removeUser(id: string) {
    return EnvironmentAccess.get(
      { projectId: this.project, environmentId: this.id, id },
      this.getLink("#manage-access")
    ).then(
      environmentAccess => environmentAccess && environmentAccess.delete()
    );
  }

  /**
   * Get environment metrics.
   *
   * @param string query
   *   InfluxDB query
   *
   * @return Metrics
   */
  getMetrics(query: string) {
    const params = query ? { q: query } : {};

    return Metrics.get(params, `${this.getUri()}/metrics`);
  }

  /**
   * Get head commit.
   *
   * @param string project id
   * @param string head commit sha
   *
   * @return Commit
   */
  getHeadCommit() {
    return Commit.get(this.project, this.head_commit);
  }
}
