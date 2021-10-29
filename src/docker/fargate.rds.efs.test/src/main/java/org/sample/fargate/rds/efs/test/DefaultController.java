package org.sample.fargate.rds.efs.test;

import javax.inject.Singleton;
import javax.ws.rs.GET;
import javax.ws.rs.Path;

import javax.naming.*;
import javax.sql.*;
import java.sql.*;

import java.io.FileWriter;   // Import the FileWriter class
import java.io.IOException;  // Import the IOException class to handle errors

/**
 *
 */
@Path("/")
@Singleton
public class DefaultController {

    @GET
    public String response() {
        return "<a href=\"db\">Test DB</a><br /><a href=\"fs\">Test FS</a><br />";
    }
}